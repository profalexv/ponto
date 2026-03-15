/**
 * ponto/app.js
 *
 * SPA de Registro de Jornada — autônoma, hospedada no GitHub Pages.
 * Funciona para qualquer empresa: comércio, indústria, saúde, escolas, etc.
 *
 * Autenticação:
 *   Login direto → formulário e-mail/senha (ponto_admins)
 *   SSO          → ?token=JWT&orgId=UUID (token pré-emitido com mesmo JWT_SECRET)
 *
 * API: https://aula-motor.fly.dev/api/ponto/*
 * Conformidade: CLT Art. 74 / Portaria MTP 671/2021 (REP-A) / LGPD
 */

/* ─── Configuração ──────────────────────────────────────────── */
const MOTOR_URL = 'https://aula-motor.fly.dev';

/* ─── Estado global ─────────────────────────────────────────── */
let _orgId = null;
let _token = null;
let _tab   = 'hoje';

/* ─── Utilitários ───────────────────────────────────────────── */
const E = (s) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const TYPE_LABELS = {
  entrada:      { label: 'Entrada',   color: '#16a34a', bg: '#dcfce7' },
  saida:        { label: 'Saída',     color: '#dc2626', bg: '#fee2e2' },
  pausa_inicio: { label: 'Pausa',     color: '#d97706', bg: '#fef3c7' },
  pausa_fim:    { label: 'Fim Pausa', color: '#7c3aed', bg: '#ede9fe' },
};

function typeBadge(type) {
  const t = TYPE_LABELS[type] || { label: type, color: '#6b7280', bg: '#f3f4f6' };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${t.color};background:${t.bg}">${t.label}</span>`;
}

/* ─── Sessão ────────────────────────────────────────────────── */
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 horas em ms

function clearSession() {
  _token = null;
  _orgId = null;
  localStorage.removeItem('ponto_token');
  localStorage.removeItem('ponto_org_id');
  localStorage.removeItem('ponto_login_at');
}

function sessionExpired() {
  clearSession();
  document.getElementById('app').classList.add('hidden');
  showLoginForm();
  showToast('Sessão encerrada. Faça login novamente.', 'warning');
}

/* ─── API helper ─────────────────────────────────────────────── */
async function api(path, options = {}) {
  const url = `${MOTOR_URL}/api/ponto${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_token}`,
      ...(options.headers || {}),
    },
  });

  // Token expirado ou inválido: encerra sessão imediatamente
  if (resp.status === 401) {
    sessionExpired();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  let body;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    body = await resp.json();
  } else {
    body = await resp.text();
  }

  if (!resp.ok) {
    const msg = (typeof body === 'object' ? body?.error || body?.message : body) || `Erro ${resp.status}`;
    throw new Error(msg);
  }
  return typeof body === 'object' ? (body.data ?? body) : body;
}

function apiGet(path, params = {}) {
  const qs = new URLSearchParams({ orgId: _orgId, ...params }).toString();
  return api(`${path}?${qs}`);
}

function apiPost(path, body = {}) {
  return api(path, { method: 'POST', body: JSON.stringify({ org_id: _orgId, ...body }) });
}

function apiPut(path, body = {}) {
  return api(path, { method: 'PUT', body: JSON.stringify(body) });
}

/* ─── Toast ──────────────────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 350);
  }, 3500);
}

/* ─── Modal ──────────────────────────────────────────────────── */
function openModal({ title, bodyHtml, confirmLabel = 'Confirmar', confirmClass = 'btn-primary', onConfirm, cancelLabel = 'Cancelar' }) {
  const overlay  = document.getElementById('modal-overlay');
  const titleEl  = document.getElementById('modal-title');
  const bodyEl   = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');

  titleEl.textContent = title;
  bodyEl.innerHTML    = bodyHtml;

  const close = () => { overlay.classList.add('hidden'); footerEl.innerHTML = ''; bodyEl.innerHTML = ''; };

  const cancelBtn  = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = cancelLabel;
  cancelBtn.addEventListener('click', close);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = `btn ${confirmClass}`;
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try { await onConfirm(overlay, close); } catch (e) { showToast(e.message, 'error'); }
    finally { if (!overlay.classList.contains('hidden')) confirmBtn.disabled = false; }
  });

  footerEl.innerHTML = '';
  footerEl.appendChild(cancelBtn);
  footerEl.appendChild(confirmBtn);

  overlay.classList.remove('hidden');

  document.getElementById('modal-close-btn').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

/* ─── confirmDialog ──────────────────────────────────────────── */
function confirmDialog(message, { title = 'Confirmar', confirmLabel = 'Confirmar', confirmClass = 'btn-danger' } = {}) {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('modal-overlay');
    const titleEl  = document.getElementById('modal-title');
    const bodyEl   = document.getElementById('modal-body');
    const footerEl = document.getElementById('modal-footer');

    titleEl.textContent = title;
    bodyEl.innerHTML = `<p style="color:#374151">${E(message)}</p>`;

    const close = (val) => { overlay.classList.add('hidden'); footerEl.innerHTML = ''; bodyEl.innerHTML = ''; resolve(val); };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => close(false));

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `btn ${confirmClass}`;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.addEventListener('click', () => close(true));

    footerEl.innerHTML = '';
    footerEl.appendChild(cancelBtn);
    footerEl.appendChild(confirmBtn);
    overlay.classList.remove('hidden');
    document.getElementById('modal-close-btn').onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
}

/* ═════════════════════════════════════════════════════════════
   ABAS
   ═════════════════════════════════════════════════════════════ */

/* ─── Aba: Hoje ──────────────────────────────────────────────── */
async function renderHoje(container) {
  container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const records = await apiGet('/today');
    if (!records?.length) {
      container.innerHTML = `
        <div class="ponto-empty">
          <span style="font-size:40px">📭</span>
          <p>Nenhum registro de ponto hoje.</p>
          <button class="btn btn-ponto-punch" id="ponto-empty-punch">⏱️ Bater Ponto agora</button>
        </div>`;
      document.getElementById('ponto-empty-punch')?.addEventListener('click', openPunchModal);
      return;
    }

    const byEmp = {};
    records.forEach(r => {
      if (!byEmp[r.employee_id]) byEmp[r.employee_id] = { name: r.employee_name, records: [] };
      byEmp[r.employee_id].records.push(r);
    });

    const rows = Object.values(byEmp).map(emp => {
      const last = emp.records[emp.records.length - 1];
      const allTimes = emp.records.map(r =>
        `<span title="${r.type}">${fmtTime(r.punched_at)} ${typeBadge(r.type)}</span>`
      ).join(' ');
      return `<tr>
        <td><strong>${E(emp.name)}</strong></td>
        <td>${typeBadge(last.type)}</td>
        <td style="font-size:12px;color:#6b7280">${allTimes}</td>
        <td>${fmtTime(last.punched_at)}</td>
        <td>${last.latitude ? `<span title="${last.latitude},${last.longitude}">📍</span>` : '—'}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="ponto-section-header">
        <span>${records.length} registro(s) hoje · ${Object.keys(byEmp).length} funcionário(s)</span>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Funcionário</th><th>Último Tipo</th><th>Marcações</th><th>Último Horário</th><th>GPS</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

/* ─── Aba: Funcionários ──────────────────────────────────────── */
async function renderFuncionarios(container) {
  container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const emps = await apiGet('/employees');
    if (!emps?.length) {
      container.innerHTML = `
        <div class="ponto-empty">
          <p>Nenhum funcionário cadastrado.</p>
          <button class="btn btn-primary" id="emp-btn-add">+ Cadastrar Funcionário</button>
        </div>`;
      document.getElementById('emp-btn-add')?.addEventListener('click', () => openEmployeeModal(null, container));
      return;
    }

    const cards = emps.map(emp => empCard(emp)).join('');
    container.innerHTML = `
      <div class="ponto-section-header">
        <span>${emps.filter(e => e.active).length} ativo(s) / ${emps.length} total</span>
        <button class="btn btn-primary btn-sm" id="emp-btn-add">+ Funcionário</button>
      </div>
      <div class="emp-grid">${cards}</div>`;

    document.getElementById('emp-btn-add')?.addEventListener('click', () => openEmployeeModal(null, container));
    container.querySelectorAll('.emp-edit-btn').forEach(btn => {
      const emp = emps.find(e => e.id === parseInt(btn.dataset.id, 10));
      btn.addEventListener('click', () => openEmployeeModal(emp, container));
    });
    container.querySelectorAll('.emp-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteEmployeeById(parseInt(btn.dataset.id, 10), container));
    });
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

function empCard(emp) {
  const badge = emp.active
    ? '<span class="emp-badge emp-badge-active">Ativo</span>'
    : '<span class="emp-badge emp-badge-inactive">Inativo</span>';
  const gpsBadge = emp.gps_consent ? '<span class="emp-badge emp-badge-gps">📍 GPS</span>' : '';
  return `
    <div class="emp-card">
      <div class="emp-card-name">${E(emp.name)}</div>
      <div class="emp-card-role">${E(emp.role || '—')} ${emp.department ? '· ' + E(emp.department) : ''}</div>
      <div class="emp-card-tags">${badge}${gpsBadge}</div>
      <div class="emp-card-actions">
        <button class="btn btn-ghost btn-sm emp-edit-btn" data-id="${emp.id}">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm emp-del-btn" data-id="${emp.id}" style="color:#dc2626">🗑 Remover</button>
      </div>
    </div>`;
}

async function deleteEmployeeById(id, container) {
  const confirmed = await confirmDialog(
    'Remover funcionário? O cadastro será inativado (os registros de ponto são mantidos por força de lei).',
    { confirmLabel: 'Remover', confirmClass: 'btn-danger', title: 'Remover Funcionário' }
  );
  if (!confirmed) return;
  try {
    await api(`/employees/${id}`, { method: 'DELETE' });
    showToast('Funcionário removido.', 'success');
    await renderFuncionarios(container);
  } catch (e) { showToast(e.message, 'error'); }
}

async function openEmployeeModal(existing, container) {
  openModal({
    title: existing ? '✏️ Editar Funcionário' : '👤 Novo Funcionário',
    bodyHtml: `
      <div class="form-group"><label>Nome *</label>
        <input type="text" id="pf-name" value="${E(existing?.name || '')}" placeholder="Nome completo"></div>
      <div class="form-group"><label>CPF</label>
        <input type="text" id="pf-cpf" value="${E(existing?.cpf || '')}" placeholder="000.000.000-00"></div>
      <div class="form-group"><label>Cargo</label>
        <input type="text" id="pf-role" value="${E(existing?.role || '')}" placeholder="Auxiliar, Operador, Analista..."></div>
      <div class="form-group"><label>Departamento</label>
        <input type="text" id="pf-dept" value="${E(existing?.department || '')}" placeholder="RH, Administrativo..."></div>
      <div class="form-group"><label>E-mail</label>
        <input type="email" id="pf-email" value="${E(existing?.email || '')}" placeholder="email@empresa.com.br"></div>
      <div class="form-group"><label>PIN ${existing ? '(deixe em branco para não alterar)' : ''}</label>
        <input type="password" id="pf-pin" placeholder="PIN numérico do funcionário" maxlength="8" autocomplete="off"></div>
      <div class="form-group">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="pf-gps" ${existing?.gps_consent ? 'checked' : ''}>
          <span>📍 Consentimento para captura de GPS (LGPD)</span>
        </label>
      </div>
      ${existing ? `
      <div class="form-group">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="pf-active" ${existing.active ? 'checked' : ''}>
          <span>Funcionário ativo</span>
        </label>
      </div>` : ''}
    `,
    confirmLabel: existing ? 'Salvar' : 'Cadastrar',
    onConfirm: async (overlay, close) => {
      const name  = overlay.querySelector('#pf-name').value.trim();
      const cpf   = overlay.querySelector('#pf-cpf').value.trim();
      const role  = overlay.querySelector('#pf-role').value.trim();
      const dept  = overlay.querySelector('#pf-dept').value.trim();
      const email = overlay.querySelector('#pf-email').value.trim();
      const pin   = overlay.querySelector('#pf-pin').value.trim();
      const gps   = overlay.querySelector('#pf-gps').checked;

      if (!name) { showToast('Informe o nome do funcionário.', 'warning'); return; }

      try {
        if (existing) {
          const data = { name, cpf, role, department: dept, email, gps_consent: gps };
          if (pin) data.pin = pin;
          const activeEl = overlay.querySelector('#pf-active');
          if (activeEl) data.active = activeEl.checked;
          await apiPut(`/employees/${existing.id}`, data);
          showToast('Funcionário atualizado.', 'success');
        } else {
          await apiPost('/employees', { name, cpf, role, department: dept, email, pin: pin || undefined, gps_consent: gps });
          showToast('Funcionário cadastrado.', 'success');
        }
        close();
        await renderFuncionarios(container);
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

/* ─── Aba: Histórico ─────────────────────────────────────────── */
async function renderHistorico(container) {
  const today   = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  container.innerHTML = `
    <div class="ponto-section-header" style="flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input type="date" id="ph-from" value="${weekAgo}" class="input-sm">
        <span style="color:#6b7280">até</span>
        <input type="date" id="ph-to" value="${today}" class="input-sm">
        <select id="ph-emp" class="input-sm" style="min-width:160px">
          <option value="">Todos os funcionários</option>
        </select>
        <button class="btn btn-primary btn-sm" id="ph-search">🔍 Filtrar</button>
        <button class="btn btn-ghost btn-sm" id="ph-afd" title="Exportar AFD (Portaria 671)">📥 AFD</button>
      </div>
    </div>
    <div id="ponto-hist-result" class="ponto-loading">Carregando...</div>`;

  try {
    const emps = await apiGet('/employees');
    const sel  = document.getElementById('ph-emp');
    emps.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      sel.appendChild(opt);
    });
  } catch (_) {}

  const doSearch = async () => {
    const from = document.getElementById('ph-from')?.value;
    const to   = document.getElementById('ph-to')?.value;
    const emp  = document.getElementById('ph-emp')?.value;
    await loadHistorico({ dateFrom: from, dateTo: to, employeeId: emp || undefined, onRefresh: doSearch });
  };

  document.getElementById('ph-search')?.addEventListener('click', doSearch);
  document.getElementById('ph-afd')?.addEventListener('click', exportAfd);
  await doSearch();
}

async function loadHistorico({ dateFrom, dateTo, employeeId, onRefresh } = {}) {
  const result = document.getElementById('ponto-hist-result');
  if (!result) return;
  result.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const params = {};
    if (dateFrom)   params.dateFrom   = dateFrom;
    if (dateTo)     params.dateTo     = dateTo;
    if (employeeId) params.employeeId = employeeId;
    const records = await apiGet('/records', params);

    if (!records?.length) {
      result.innerHTML = `<div class="ponto-empty"><p>Nenhum registro no período.</p></div>`;
      return;
    }

    const rows = records.map(r => `
      <tr class="${r.cancelled ? 'ponto-cancelled' : ''}">
        <td>${E(r.employee_name)}</td>
        <td>${typeBadge(r.type)}</td>
        <td>${fmtDate(r.punched_at)}</td>
        <td style="font-size:11px;color:#6b7280">${E(r.source)}</td>
        <td>${r.latitude ? `<span title="${r.latitude},${r.longitude}">📍</span>` : '—'}</td>
        <td>
          ${r.cancelled
            ? `<span style="color:#dc2626;font-size:11px" title="${E(r.cancel_reason)} (${E(r.cancelled_by)})">Cancelado</span>`
            : `<button class="btn btn-ghost btn-sm ponto-cancel-btn" data-record-id="${r.id}">✕</button>`
          }
        </td>
      </tr>`).join('');

    result.innerHTML = `
      <div style="font-size:12px;color:#6b7280;padding:4px 0">${records.length} registro(s)</div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Funcionário</th><th>Tipo</th><th>Horário</th><th>Origem</th><th>GPS</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    result.querySelectorAll('.ponto-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => openCancelRecordModal(parseInt(btn.dataset.recordId, 10), onRefresh));
    });
  } catch (e) {
    result.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

function openCancelRecordModal(id, onDone) {
  openModal({
    title: '⚠️ Cancelar Registro de Ponto',
    bodyHtml: `
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">
        Registros de ponto são imutáveis. O cancelamento fica gravado na auditoria (CLT/Portaria 671).
      </p>
      <div class="form-group">
        <label>Seu nome (gestor responsável) *</label>
        <input type="text" id="cr-by" placeholder="Nome de quem está cancelando">
      </div>
      <div class="form-group">
        <label>Motivo *</label>
        <textarea id="cr-reason" rows="3" placeholder="Ex: duplicidade por falha de rede"></textarea>
      </div>`,
    confirmLabel: 'Confirmar Cancelamento',
    confirmClass: 'btn-danger',
    onConfirm: async (overlay, close) => {
      const by     = overlay.querySelector('#cr-by').value.trim();
      const reason = overlay.querySelector('#cr-reason').value.trim();
      if (!by || !reason) { showToast('Preencha todos os campos.', 'warning'); return; }
      try {
        await apiPut(`/records/${id}/cancel`, { cancelled_by: by, cancel_reason: reason });
        showToast('Registro cancelado e gravado na auditoria.', 'success');
        close();
        if (onDone) onDone();
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

async function exportAfd() {
  const from = document.getElementById('ph-from')?.value;
  const to   = document.getElementById('ph-to')?.value;
  try {
    const params = new URLSearchParams({ orgId: _orgId });
    if (from) params.set('dateFrom', from);
    if (to)   params.set('dateTo',   to);
    const url  = `${MOTOR_URL}/api/ponto/records/export-afd?${params}`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${_token}` } });
    if (!resp.ok) throw new Error(await resp.text());
    const text = await resp.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `AFD_${_orgId}_${from || 'completo'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showToast('AFD exportado.', 'success');
  } catch (e) { showToast('Erro ao exportar AFD: ' + e.message, 'error'); }
}

/* ─── Aba: Verificação ───────────────────────────────────────── */
async function renderVerificacao(container) {
  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = `
    <div class="ponto-section-header" style="flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label style="color:#374151;font-size:13px;font-weight:500">Data:</label>
        <input type="date" id="pv-date" value="${today}" class="input-sm">
        <button class="btn btn-primary btn-sm" id="pv-load">🔍 Carregar</button>
        <button class="btn btn-ghost btn-sm" id="pv-add">+ Novo Visto</button>
      </div>
    </div>
    <div id="ponto-verif-result" class="ponto-loading">Carregando...</div>`;

  const doLoad = async () => {
    const date = document.getElementById('pv-date')?.value;
    await loadVerificacoes(date);
  };
  document.getElementById('pv-load')?.addEventListener('click', doLoad);
  document.getElementById('pv-add')?.addEventListener('click', () => openVerifModal(null, doLoad));
  await doLoad();
}

async function loadVerificacoes(date) {
  const result = document.getElementById('ponto-verif-result');
  if (!result) return;
  result.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const params = {};
    if (date) { params.dateFrom = date; params.dateTo = date; }
    const verifs = await apiGet('/verifications', params);

    if (!verifs?.length) {
      result.innerHTML = `<div class="ponto-empty"><p>Nenhum visto registrado para essa data.</p><button class="btn btn-ghost btn-sm" id="pv-empty-add">+ Registrar visto</button></div>`;
      document.getElementById('pv-empty-add')?.addEventListener('click', () => openVerifModal(null, () => loadVerificacoes(date)));
      return;
    }

    const STATUS_BADGE = {
      pendente:      '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#92400e;background:#fef3c7">⏳ Pendente</span>',
      validado:      '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#065f46;background:#d1fae5">✅ Validado</span>',
      inconsistente: '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#991b1b;background:#fee2e2">⚠️ Inconsistente</span>',
    };

    const rows = verifs.map(v => `
      <tr>
        <td>${E(v.employee_name)}</td>
        <td>${E(v.record_date)}</td>
        <td>${STATUS_BADGE[v.status] || E(v.status)}</td>
        <td>${E(v.verified_by)}</td>
        <td>${fmtDate(v.verified_at)}</td>
        <td style="font-size:11px;color:#6b7280;max-width:200px;word-break:break-word">${E(v.notes || '—')}</td>
        <td><button class="btn btn-ghost btn-sm pv-edit-btn" data-verif-id="${v.id}">✏️</button></td>
      </tr>`).join('');

    result.innerHTML = `
      <div style="font-size:12px;color:#6b7280;padding:4px 0">${verifs.length} visto(s)</div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Funcionário</th><th>Data</th><th>Status</th><th>Supervisor</th><th>Visitado em</th><th>Observações</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    result.querySelectorAll('.pv-edit-btn').forEach(btn => {
      const v = verifs.find(x => x.id === parseInt(btn.dataset.verifId, 10));
      btn.addEventListener('click', () => openVerifModal(v, () => loadVerificacoes(date)));
    });
  } catch (e) {
    result.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

async function openVerifModal(existing, onDone) {
  let employees = [];
  if (!existing) {
    try {
      const all = await apiGet('/employees');
      employees = all.filter(e => e.active);
    } catch (_) {}
  }

  openModal({
    title: existing ? '✏️ Atualizar Visto' : '✅ Registrar Visto Diário',
    bodyHtml: `
      ${!existing ? `
      <div class="form-group">
        <label>Funcionário *</label>
        <select id="pv-modal-emp">
          <option value="">Selecione...</option>
          ${employees.map(e => `<option value="${e.id}">${E(e.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Data *</label>
        <input type="date" id="pv-modal-date" value="${new Date().toISOString().slice(0, 10)}">
      </div>` : `<p style="color:#374151;font-size:13px;margin-bottom:12px"><strong>${E(existing.employee_name)}</strong> — ${E(existing.record_date)}</p>`}
      <div class="form-group">
        <label>Supervisor (seu nome) *</label>
        <input type="text" id="pv-modal-by" value="${E(existing?.verified_by || '')}" placeholder="Nome do supervisor">
      </div>
      <div class="form-group">
        <label>Status *</label>
        <select id="pv-modal-status">
          <option value="pendente" ${existing?.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
          <option value="validado" ${existing?.status === 'validado' ? 'selected' : ''}>✅ Validado</option>
          <option value="inconsistente" ${existing?.status === 'inconsistente' ? 'selected' : ''}>⚠️ Inconsistente</option>
        </select>
      </div>
      <div id="pv-notes-group" style="${existing?.status === 'inconsistente' ? '' : 'display:none'}">
        <div class="form-group">
          <label>Observações / Justificativa *</label>
          <textarea id="pv-modal-notes" rows="3" placeholder="Descreva a inconsistência encontrada">${E(existing?.notes || '')}</textarea>
        </div>
      </div>`,
    confirmLabel: existing ? 'Salvar Alteração' : 'Registrar Visto',
    onConfirm: async (overlay, close) => {
      const status = overlay.querySelector('#pv-modal-status').value;
      const by     = overlay.querySelector('#pv-modal-by').value.trim();
      const notes  = overlay.querySelector('#pv-modal-notes')?.value.trim() || '';
      if (!by) { showToast('Informe o nome do supervisor.', 'warning'); return; }
      if (status === 'inconsistente' && !notes) { showToast('Justificativa obrigatória para status Inconsistente.', 'warning'); return; }
      try {
        if (existing) {
          await apiPut(`/verifications/${existing.id}`, { status, notes: notes || null, verified_by: by });
        } else {
          const empId = overlay.querySelector('#pv-modal-emp')?.value;
          const date  = overlay.querySelector('#pv-modal-date')?.value;
          if (!empId || !date) { showToast('Selecione o funcionário e a data.', 'warning'); return; }
          await apiPost('/verifications', { employee_id: parseInt(empId, 10), record_date: date, verified_by: by, status, notes: notes || null });
        }
        showToast('Visto registrado.', 'success');
        close();
        if (onDone) onDone();
      } catch (e) { showToast(e.message, 'error'); }
    },
  });

  document.getElementById('pv-modal-status')?.addEventListener('change', ev => {
    const notesGroup = document.getElementById('pv-notes-group');
    if (notesGroup) notesGroup.style.display = (ev.target.value === 'inconsistente') ? '' : 'none';
  });
}

/* ─── Aba: Folha Mensal ──────────────────────────────────────── */
async function renderFolha(container) {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  container.innerHTML = `
    <div class="ponto-section-header" style="flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label style="color:#374151;font-size:13px;font-weight:500">Mês:</label>
        <input type="month" id="pf-month" value="${curMonth}" class="input-sm">
        <button class="btn btn-primary btn-sm" id="pf-load">🔍 Carregar</button>
      </div>
    </div>
    <div id="ponto-folha-result" class="ponto-loading">Carregando...</div>`;

  const doLoad = async () => {
    const month = document.getElementById('pf-month')?.value;
    await loadFolha(month);
  };
  document.getElementById('pf-load')?.addEventListener('click', doLoad);
  await doLoad();
}

async function loadFolha(periodMonth) {
  const result = document.getElementById('ponto-folha-result');
  if (!result) return;
  result.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const [employees, signatures, settings] = await Promise.all([
      apiGet('/employees'),
      apiGet('/signatures', { periodMonth }),
      apiGet('/settings'),
    ]);

    const allowElectronic = settings?.allow_electronic_signature !== false;
    const allowPhysical   = settings?.allow_physical_signature   !== false;
    const sigMap = {};
    (signatures || []).forEach(s => { sigMap[s.employee_id] = s; });

    const activeEmps = (employees || []).filter(e => !e.deleted_at);
    if (!activeEmps.length) {
      result.innerHTML = `<div class="ponto-empty"><p>Nenhum funcionário cadastrado.</p></div>`;
      return;
    }

    const rows = activeEmps.map(emp => {
      const sig = sigMap[emp.id];
      let statusCell, actionCell;

      if (!sig || !sig.method) {
        statusCell = `<span style="color:#92400e;font-weight:500">⏳ Pendente</span>`;
        const btns = [];
        if (allowElectronic) btns.push(`<button class="btn btn-primary btn-sm pf-e-sign" data-emp-id="${emp.id}" data-emp-name="${E(emp.name)}" data-sig-id="${sig?.id || ''}">✅ Aceite Eletrônico</button>`);
        if (allowPhysical)   btns.push(`<button class="btn btn-ghost btn-sm pf-upload" data-emp-id="${emp.id}" data-emp-name="${E(emp.name)}" data-sig-id="${sig?.id || ''}">📤 Upload Scan</button>`);
        actionCell = btns.length ? btns.join(' ') : '<span style="color:#6b7280;font-size:11px">Nenhum método habilitado</span>';
      } else if (sig.method === 'electronic') {
        statusCell = `<span style="color:#065f46;font-weight:500">✅ Assinado Eletronicamente</span>`;
        actionCell = `<span style="font-size:11px;color:#6b7280">${E(sig.signed_by_name)} · ${fmtDate(sig.signed_at)}</span>`;
      } else {
        statusCell = `<span style="color:#1d4ed8;font-weight:500">📁 Scan Enviado</span>`;
        actionCell = `<span style="font-size:11px;color:#6b7280">Upload por ${E(sig.uploaded_by)} · ${fmtDate(sig.uploaded_at)}</span>`;
      }

      return `<tr>
        <td>${E(emp.name)}</td>
        <td>${statusCell}</td>
        <td>${actionCell}</td>
      </tr>`;
    }).join('');

    result.innerHTML = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#14532d">
        Aceite eletrônico grava o próprio funcionário como validador + data/hora do clique.
        Envio do scan físico valida todos os registros do período.
        ${!allowElectronic ? ' <strong>· Aceite eletrônico desativado para esta organização.</strong>' : ''}
        ${!allowPhysical   ? ' <strong>· Envio físico desativado para esta organização.</strong>'    : ''}
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Funcionário</th><th>Status</th><th>Detalhe / Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn-ghost btn-sm" id="pf-settings-btn">⚙️ Config. de Assinatura</button>
      </div>`;

    result.querySelectorAll('.pf-e-sign').forEach(btn => {
      btn.addEventListener('click', () =>
        openElectronicSignModal(btn.dataset, periodMonth, () => loadFolha(periodMonth)));
    });
    result.querySelectorAll('.pf-upload').forEach(btn => {
      btn.addEventListener('click', () =>
        openUploadScanModal(btn.dataset, periodMonth, () => loadFolha(periodMonth)));
    });
    document.getElementById('pf-settings-btn')?.addEventListener('click', () =>
      openFolhaSettings(settings, periodMonth));
  } catch (e) {
    result.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

async function openElectronicSignModal(dataset, periodMonth, onDone) {
  const empName = dataset.empName;
  const empId   = parseInt(dataset.empId, 10);
  let   sigId   = parseInt(dataset.sigId, 10) || 0;

  openModal({
    title: '✅ Aceite Eletrônico — Folha de Ponto',
    bodyHtml: `
      <p style="color:#374151;font-size:14px;margin-bottom:8px">
        <strong>${E(empName)}</strong> — ${E(periodMonth)}
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:#14532d">
        Ao confirmar, o aceite eletrônico da folha de ponto do período
        <strong>${E(periodMonth)}</strong> será registrado com o nome deste funcionário
        e o horário atual como validador. Todos os registros do período serão validados.
      </div>
      <p style="font-size:12px;color:#6b7280">
        ⚠️ Esta ação não pode ser desfeita.
        Caso haja inconsistência, utilize o Visto de Supervisão.
      </p>`,
    confirmLabel: '✅ Confirmar Aceite',
    onConfirm: async (overlay, close) => {
      try {
        if (!sigId) {
          const created = await apiPost('/signatures', { employee_id: empId, period_month: periodMonth });
          sigId = created?.id;
        }
        await apiPut(`/signatures/${sigId}/electronic-sign`, {});
        showToast('Aceite eletrônico registrado com sucesso.', 'success');
        close();
        if (onDone) onDone();
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

function openUploadScanModal(dataset, periodMonth, onDone) {
  const empName = dataset.empName;
  const empId   = parseInt(dataset.empId, 10);
  let   sigId   = parseInt(dataset.sigId, 10) || 0;

  openModal({
    title: '📤 Upload — Scan da Folha Assinada',
    bodyHtml: `
      <p style="color:#374151;font-size:14px;margin-bottom:8px">
        <strong>${E(empName)}</strong> — ${E(periodMonth)}
      </p>
      <div class="form-group">
        <label>Arquivo (PDF ou imagem) *</label>
        <input type="file" id="pf-upload-file" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="form-group">
        <label>Quem está fazendo o upload *</label>
        <input type="text" id="pf-upload-by" placeholder="Seu nome">
      </div>
      <p style="font-size:12px;color:#6b7280">
        O envio do scan físico valida todos os registros do período.
      </p>`,
    confirmLabel: '📤 Enviar Arquivo',
    onConfirm: async (overlay, close) => {
      const fileInput = overlay.querySelector('#pf-upload-file');
      const uploadBy  = overlay.querySelector('#pf-upload-by').value.trim();
      const file      = fileInput?.files?.[0];
      if (!file)     { showToast('Selecione um arquivo.', 'warning'); return; }
      if (!uploadBy) { showToast('Informe quem está fazendo o upload.', 'warning'); return; }
      if (file.size > 10 * 1024 * 1024) { showToast('Arquivo muito grande (máx. 10 MB).', 'warning'); return; }
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        if (!sigId) {
          const created = await apiPost('/signatures', { employee_id: empId, period_month: periodMonth });
          sigId = created?.id;
        }
        await api(`/signatures/${sigId}/upload`, {
          method: 'POST',
          body: JSON.stringify({ fileData: base64, fileName: file.name, uploadedBy: uploadBy }),
        });
        showToast('Scan enviado e folha arquivada.', 'success');
        close();
        if (onDone) onDone();
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

function openFolhaSettings(currentSettings, periodMonth) {
  openModal({
    title: '⚙️ Configurações de Assinatura',
    bodyHtml: `
      <p style="color:#6b7280;font-size:13px;margin-bottom:12px">
        Define quais métodos de assinatura são aceitos nesta organização.
      </p>
      <div class="form-group">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="pfs-electronic" ${currentSettings?.allow_electronic_signature !== false ? 'checked' : ''}>
          <span>✅ Permitir aceite eletrônico (clique do funcionário no app)</span>
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="pfs-physical" ${currentSettings?.allow_physical_signature !== false ? 'checked' : ''}>
          <span>📄 Permitir envio de scan físico assinado</span>
        </label>
      </div>`,
    confirmLabel: 'Salvar Configurações',
    onConfirm: async (overlay, close) => {
      const allowElectronic = overlay.querySelector('#pfs-electronic').checked;
      const allowPhysical   = overlay.querySelector('#pfs-physical').checked;
      if (!allowElectronic && !allowPhysical) {
        showToast('Pelo menos um método de assinatura deve ser permitido.', 'warning');
        return;
      }
      try {
        await apiPut('/settings', { allow_electronic_signature: allowElectronic, allow_physical_signature: allowPhysical });
        showToast('Configurações salvas.', 'success');
        close();
        const content = document.getElementById('ponto-tab-content');
        if (content && _tab === 'folha') await renderFolha(content);
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

/* ─── Aba: Assinatura (plano) ────────────────────────────────── */
async function renderAssinatura(container) {
  container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const st = await apiGet('/status');
    const { active, plan, employeeCount, maxEmployees } = st ?? {};

    const PLAN_NAMES = {
      per_employee: 'Por Funcionário',
      mini:         'PONTO MINI (até 30)',
      pronto:       'PONTO PRONTO (até 80)',
      maximo:       'PONTO MÁXIMO (ilimitado)',
    };
    const planName  = active ? (PLAN_NAMES[plan] || plan) : 'Não contratado';
    const limitText = active
      ? (maxEmployees > 0 ? `${employeeCount} / ${maxEmployees} funcionários` : `${employeeCount} funcionários (ilimitado)`)
      : '—';

    container.innerHTML = `
      <div class="ponto-subscription-card">
        <div class="ponto-sub-row">
          <span class="ponto-sub-label">Plano</span>
          <span class="ponto-sub-value">${planName}</span>
        </div>
        <div class="ponto-sub-row">
          <span class="ponto-sub-label">Status</span>
          <span class="ponto-sub-value">${active
            ? '<span style="color:#16a34a;font-weight:600">● Ativo</span>'
            : '<span style="color:#dc2626;font-weight:600">● Inativo</span>'}</span>
        </div>
        <div class="ponto-sub-row">
          <span class="ponto-sub-label">Uso</span>
          <span class="ponto-sub-value">${limitText}</span>
        </div>
      </div>
      <p style="color:#6b7280;font-size:13px;margin-top:8px">
        Para alterar ou cancelar o plano, acesse
        <a href="/plano/" style="color:#2563eb">Gerenciar Plano</a>.
      </p>`;
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

/* ─── Modal: Bater Ponto ─────────────────────────────────────── */
async function openPunchModal() {
  let employees = [];
  try {
    const all = await apiGet('/employees');
    employees = all.filter(e => e.active);
  } catch (_) {}

  if (!employees.length) {
    showToast('Nenhum funcionário ativo cadastrado.', 'warning');
    return;
  }

  // Detecta nomes duplicados para exibir cargo/depto como desambiguação
  const nameCount = {};
  employees.forEach(e => { nameCount[e.name] = (nameCount[e.name] || 0) + 1; });
  const empLabel = (e) => {
    if (nameCount[e.name] <= 1) return E(e.name);
    const extra = [e.department, e.role].filter(Boolean).join(' · ');
    return `${E(e.name)}${extra ? ` <small style="color:#6b7280">(${E(extra)})</small>` : ''}`;
  };

  openModal({
    title: '⏱️ Registrar Ponto',
    bodyHtml: `
      <div class="form-group">
        <label>Funcionário *</label>
        <select id="punch-emp">
          <option value="">Selecione...</option>
          ${employees.map(e => `<option value="${e.id}" data-gps="${e.gps_consent ? '1' : '0'}">${empLabel(e)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Tipo de Registro *</label>
        <select id="punch-type">
          <option value="entrada">▶ Entrada</option>
          <option value="saida">■ Saída</option>
          <option value="pausa_inicio">⏸ Início de Pausa</option>
          <option value="pausa_fim">▶ Fim de Pausa</option>
        </select>
      </div>
      <div class="form-group">
        <label>PIN <small style="color:#6b7280">(se cadastrado para este funcionário)</small></label>
        <input type="password" id="punch-pin" placeholder="PIN do funcionário" maxlength="8" autocomplete="off">
      </div>
      <div id="punch-gps-row" style="display:none;background:#f0fdf4;border-radius:8px;padding:8px 12px" class="form-group">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="punch-gps" checked>
          <span>📍 Incluir localização GPS</span>
        </label>
      </div>
      <div id="punch-status" style="font-size:12px;color:#6b7280;margin-top:4px"></div>`,
    confirmLabel: '✅ Registrar',
    confirmClass: 'btn-success',
    onConfirm: async (overlay, close) => {
      const empSel   = overlay.querySelector('#punch-emp');
      const empId    = parseInt(empSel.value, 10);
      const type     = overlay.querySelector('#punch-type').value;
      const pin      = overlay.querySelector('#punch-pin').value.trim();
      const useGps   = overlay.querySelector('#punch-gps')?.checked ?? false;
      const statusEl = overlay.querySelector('#punch-status');

      if (!empId) { showToast('Selecione o funcionário.', 'warning'); return; }
      statusEl.textContent = 'Registrando...';

      try {
        const data = { employee_id: empId, type, source: 'browser' };
        if (pin) data.pin = pin;

        if (useGps && navigator.geolocation) {
          await new Promise(resolve => {
            navigator.geolocation.getCurrentPosition(
              pos => { data.latitude = pos.coords.latitude; data.longitude = pos.coords.longitude; resolve(); },
              ()  => resolve(),
              { timeout: 5000, maximumAge: 30000 }
            );
          });
        }

        const res = await apiPost('/records', data);
        showToast(`Ponto registrado às ${fmtTime(res.punched_at || new Date().toISOString())}.`, 'success');
        close();
        const content = document.getElementById('ponto-tab-content');
        if (content && _tab === 'hoje') await renderHoje(content);
      } catch (e) {
        statusEl.textContent = '';
        showToast(e.message, 'error');
      }
    },
  });

  document.getElementById('punch-emp')?.addEventListener('change', ev => {
    const opt    = ev.target.selectedOptions[0];
    const gpsRow = document.getElementById('punch-gps-row');
    if (gpsRow) gpsRow.style.display = (opt?.dataset.gps === '1') ? '' : 'none';
  });
}

/* ─── Troca de aba ───────────────────────────────────────────── */
function switchTab(name) {
  _tab = name;
  document.querySelectorAll('.ponto-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pontoTab === name);
  });
  const content = document.getElementById('ponto-tab-content');
  if (!content) return;
  switch (name) {
    case 'hoje':         renderHoje(content);         break;
    case 'funcionarios': renderFuncionarios(content); break;
    case 'historico':    renderHistorico(content);    break;
    case 'verificacao':  renderVerificacao(content);  break;
    case 'folha':        renderFolha(content);        break;
    case 'assinatura':   renderAssinatura(content);   break;
  }
}

/* ═════════════════════════════════════════════════════════════
   LOGIN DIRETO (sem SSO)
   ═════════════════════════════════════════════════════════════ */

/* ─── LOGIN DIRETO + SELEÇÃO DE EMPRESA ───────────────────────────────── */

/**
 * Esconde todas as telas de autenticação.
 */
function hideAuthScreens() {
  ['app-login', 'app-org-select', 'app'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

/**
 * Exibe a tela de seleção de empresa após login multi-org.
 * A junção das contas é exclusivamente por LOGIN (mesmo e-mail + mesma senha).
 * Se o gestor tiver logins diferentes por empresa, nunca chegará aqui.
 */
function showOrgSelectScreen(orgs, selectionToken) {
  hideAuthScreens();
  const screen = document.getElementById('app-org-select');
  const list   = document.getElementById('org-select-list');
  screen.classList.remove('hidden');

  list.innerHTML = orgs.map(org => `
    <button class="btn btn-outline org-select-btn" style="text-align:left;padding:14px 16px;border-radius:10px;display:flex;align-items:center;gap:12px" data-org-id="${E(org.orgId)}">
      <span style="font-size:22px">🏢</span>
      <span style="font-size:15px;font-weight:600;color:#111827">${E(org.orgName)}</span>
    </button>`).join('');

  list.querySelectorAll('.org-select-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.style.opacity = '0.6';
      try {
        await doSelectOrg(selectionToken, btn.dataset.orgId);
        screen.classList.add('hidden');
        startApp();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled  = false;
        btn.style.opacity = '1';
      }
    });
  });

  document.getElementById('org-select-back').onclick = () => {
    screen.classList.add('hidden');
    clearSession();
    showLoginForm();
  };
}

/**
 * Segunda etapa do login multi-org: troca selectionToken + orgId por JWT.
 */
async function doSelectOrg(selectionToken, orgId) {
  const resp = await fetch(`${MOTOR_URL}/api/ponto/auth/select-org`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectionToken, orgId }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error || 'Erro ao selecionar empresa.');
  _token = body.token;
  _orgId = body.orgId;
  localStorage.setItem('ponto_token',    body.token);
  localStorage.setItem('ponto_org_id',   body.orgId);
  localStorage.setItem('ponto_login_at', Date.now().toString());
  return body;
}

async function doLogin(email, password) {
  const resp = await fetch(`${MOTOR_URL}/api/ponto/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error || 'Credenciais inválidas.');

  // Login com múltiplas empresas: encaminha para o seletor
  if (body.multiOrg) {
    showOrgSelectScreen(body.orgs, body.selectionToken);
    return null; // startApp será chamado dentro do seletor
  }

  _token = body.token;
  _orgId = body.orgId;
  localStorage.setItem('ponto_token',   body.token);
  localStorage.setItem('ponto_org_id',  body.orgId);
  localStorage.setItem('ponto_login_at', Date.now().toString());
  return body;
}

function showLoginForm() {
  document.getElementById('app-login').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');

  const form      = document.getElementById('login-form');
  const errEl     = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    errEl.textContent = '';
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      errEl.textContent = 'Informe e-mail e senha.';
      errEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Entrando...';
    try {
      const result = await doLogin(email, password);
      // multiOrg: doLogin já exibiu o seletor; não chama startApp aqui
      if (result === null) {
        document.getElementById('app-login').classList.add('hidden');
        return;
      }
      document.getElementById('app-login').classList.add('hidden');
      startApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Entrar';
    }
  });
}

/* ═════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
   ═════════════════════════════════════════════════════════════ */

function startApp() {
  document.getElementById('app').classList.remove('hidden');

  // Exibe nome da organização no header
  apiGet('/status').then(st => {
    const orgEl = document.getElementById('app-header-org');
    if (orgEl && st?.orgName) orgEl.textContent = st.orgName;
  }).catch(() => {});

  // Eventos dos tabs
  document.querySelectorAll('.ponto-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.pontoTab));
  });

  // Botão principal "Bater Ponto"
  document.getElementById('ponto-btn-bater')?.addEventListener('click', openPunchModal);

  // Botão Sair
  document.getElementById('ponto-btn-sair')?.addEventListener('click', () => {
    clearSession();
    window.location.href = '/system/';
  });

  // Carrega aba inicial
  switchTab('hoje');
}

(function init() {
  // 1. SSO: ?token=JWT&orgId=UUID (redirecionamento com token pré-válido)
  const params   = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const urlOrgId = params.get('orgId');

  if (urlToken) {
    _token = urlToken;
    localStorage.setItem('ponto_token',   urlToken);
    localStorage.setItem('ponto_login_at', Date.now().toString());
  } else {
    _token = localStorage.getItem('ponto_token');
  }

  if (urlOrgId) {
    _orgId = urlOrgId;
    localStorage.setItem('ponto_org_id', urlOrgId);
  } else {
    _orgId = localStorage.getItem('ponto_org_id');
  }

  // Limpa params da URL após salvar (sem reload)
  if (urlToken || urlOrgId) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  // 2. Sem token: exibe formulário de login direto (para qualquer empresa)
  if (!_token || !_orgId) {
    showLoginForm();
    return;
  }

  // 3. Verifica se a sessão local passou de 24h
  const loginAt = parseInt(localStorage.getItem('ponto_login_at') || '0', 10);
  if (!loginAt || Date.now() - loginAt > SESSION_TTL) {
    clearSession();
    showLoginForm();
    return;
  }

  // 4. Token presente e sessão válida: inicia a aplicação
  startApp();
})();
