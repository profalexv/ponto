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
let _orgId          = null;
let _token          = null;
let _tab            = 'hoje';
let _logoUrl        = null;   // URL da logo da organização
let _displayOrgName = null;   // Nome de exibição

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

/* ─── Aba: Funcionários (expandida com foto e documentos) ─── */
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
    container.querySelectorAll('.emp-docs-btn').forEach(btn => {
      const emp = emps.find(e => e.id === parseInt(btn.dataset.id, 10));
      btn.addEventListener('click', () => openEmployeeDocsModal(emp));
    });
    container.querySelectorAll('.emp-photo-btn').forEach(btn => {
      const emp = emps.find(e => e.id === parseInt(btn.dataset.id, 10));
      btn.addEventListener('click', () => openEmployeePhotoModal(emp));
    });
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

function empCard(emp) {
  const badge = emp.active
    ? '<span class="emp-badge emp-badge-active">Ativo</span>'
    : '<span class="emp-badge emp-badge-inactive">Inativo</span>';
  const gpsBadge  = emp.gps_consent    ? '<span class="emp-badge emp-badge-gps">📍 GPS</span>'   : '';
  const imgBadge  = emp.image_consent  ? '<span class="emp-badge" style="background:#fce7f3;color:#9d174d">📷 Foto</span>' : '';
  const hwBadge   = emp.hardware_consent  ? '<span class="emp-badge" style="background:#eff6ff;color:#1d4ed8">💻 HW</span>' : '';
  const digBadge  = emp.digital_consent   ? '<span class="emp-badge" style="background:#f0fdf4;color:#166534">✍️ Digital</span>' : '';
  return `
    <div class="emp-card">
      <div class="emp-card-name">${E(emp.name)}</div>
      <div class="emp-card-role">${E(emp.role || '—')} ${emp.department ? '· ' + E(emp.department) : ''}</div>
      ${emp.hire_date ? `<div style="font-size:11px;color:#9ca3af">Admissão: ${new Date(emp.hire_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
      <div class="emp-card-tags">${badge}${gpsBadge}${imgBadge}${hwBadge}${digBadge}</div>
      <div class="emp-card-actions">
        <button class="btn btn-ghost btn-sm emp-edit-btn"  data-id="${emp.id}">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm emp-photo-btn" data-id="${emp.id}">📷 Foto</button>
        <button class="btn btn-ghost btn-sm emp-docs-btn"  data-id="${emp.id}">📁 Docs</button>
        <button class="btn btn-ghost btn-sm emp-del-btn"   data-id="${emp.id}" style="color:#dc2626">🗑 Remover</button>
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label>Nome *</label>
          <input type="text" id="pf-name" value="${E(existing?.name || '')}" placeholder="Nome completo"></div>
        <div class="form-group"><label>CPF</label>
          <input type="text" id="pf-cpf" value="${E(existing?.cpf || '')}" placeholder="000.000.000-00"></div>
        <div class="form-group"><label>Cargo</label>
          <input type="text" id="pf-role" value="${E(existing?.role || '')}" placeholder="Auxiliar, Operador..."></div>
        <div class="form-group"><label>Departamento</label>
          <input type="text" id="pf-dept" value="${E(existing?.department || '')}" placeholder="RH, Administrativo..."></div>
        <div class="form-group"><label>E-mail</label>
          <input type="email" id="pf-email" value="${E(existing?.email || '')}" placeholder="email@empresa.com.br"></div>
        <div class="form-group"><label>Data de Admissão</label>
          <input type="date" id="pf-hire" value="${E(existing?.hire_date || '')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>Horário de Trabalho</label>
          <input type="text" id="pf-schedule" value="${E(existing?.work_schedule || '')}" placeholder="08:00–17:00 seg–sex"></div>
      </div>
      <div class="form-group"><label>PIN ${existing ? '(deixe em branco para não alterar)' : ''}</label>
        <input type="password" id="pf-pin" placeholder="PIN numérico" maxlength="8" autocomplete="off"></div>
      <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-top:8px">
        <p style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Consentimentos LGPD</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pf-gps" ${existing?.gps_consent ? 'checked' : ''}>
            <span>📍 GPS</span>
          </label>
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pf-image" ${existing?.image_consent ? 'checked' : ''}>
            <span>📷 Uso de Imagem</span>
          </label>
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pf-hw" ${existing?.hardware_consent ? 'checked' : ''}>
            <span>💻 Hardware Próprio</span>
          </label>
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pf-digital" ${existing?.digital_consent ? 'checked' : ''}>
            <span>✍️ Aceite Digital</span>
          </label>
        </div>
      </div>
      ${existing ? `
      <div class="form-group" style="margin-top:8px">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="pf-active" ${existing.active ? 'checked' : ''}>
          <span>Funcionário ativo</span>
        </label>
      </div>` : ''}
    `,
    confirmLabel: existing ? 'Salvar' : 'Cadastrar',
    onConfirm: async (overlay, close) => {
      const name     = overlay.querySelector('#pf-name').value.trim();
      const cpf      = overlay.querySelector('#pf-cpf').value.trim();
      const role     = overlay.querySelector('#pf-role').value.trim();
      const dept     = overlay.querySelector('#pf-dept').value.trim();
      const email    = overlay.querySelector('#pf-email').value.trim();
      const hire     = overlay.querySelector('#pf-hire').value;
      const schedule = overlay.querySelector('#pf-schedule').value.trim();
      const pin      = overlay.querySelector('#pf-pin').value.trim();
      const gps      = overlay.querySelector('#pf-gps').checked;
      const image    = overlay.querySelector('#pf-image').checked;
      const hw       = overlay.querySelector('#pf-hw').checked;
      const digital  = overlay.querySelector('#pf-digital').checked;

      if (!name) { showToast('Informe o nome do funcionário.', 'warning'); return; }

      try {
        if (existing) {
          const data = { name, cpf, role, department: dept, email, gps_consent: gps, image_consent: image, hardware_consent: hw, digital_consent: digital, hire_date: hire || null, work_schedule: schedule };
          if (pin) data.pin = pin;
          const activeEl = overlay.querySelector('#pf-active');
          if (activeEl) data.active = activeEl.checked;
          await apiPut(`/employees/${existing.id}`, data);
          showToast('Funcionário atualizado.', 'success');
        } else {
          await apiPost('/employees', { name, cpf, role, department: dept, email, pin: pin || undefined, gps_consent: gps, image_consent: image, hardware_consent: hw, digital_consent: digital, hire_date: hire || null, work_schedule: schedule });
          showToast('Funcionário cadastrado.', 'success');
        }
        close();
        await renderFuncionarios(container);
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

/* ─── Modal: Foto do Funcionário ─────────────────────────────── */
async function openEmployeePhotoModal(emp) {
  let currentPhoto = null;
  try { currentPhoto = await apiGet(`/employees/${emp.id}/photo`); } catch (_) {}

  openModal({
    title: `📷 Foto — ${E(emp.name)}`,
    bodyHtml: `
      ${currentPhoto ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">
        <strong>Foto cadastrada:</strong> ${E(currentPhoto.file_name)}<br>
        <span style="color:#6b7280;font-size:11px">
          Armazenada em: ${E(currentPhoto.storage_type)} · Enviada por ${E(currentPhoto.uploaded_by)} em ${fmtDate(currentPhoto.uploaded_at)}
          ${currentPhoto.auto_delete_at ? ` · Exclusão programada: ${fmtDate(currentPhoto.auto_delete_at)}` : ''}
        </span>
        <br><a href="${E(currentPhoto.storage_ref)}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb">🔗 Abrir arquivo</a>
        <button class="btn btn-ghost btn-sm" id="photo-del-btn" style="color:#dc2626;margin-left:8px">🗑 Remover foto</button>
      </div>` : `<p style="color:#6b7280;font-size:13px;margin-bottom:12px">Nenhuma foto cadastrada para este funcionário.</p>`}
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#92400e">
        ⚠️ O arquivo da foto deve ser enviado ao storage externo configurado (Google Drive, OneDrive ou pasta de rede) e o link/ID informado aqui.<br>
        O sistema registra a existência e localização da foto — a existência do arquivo depende da manutenção do storage.
      </div>
      <div class="form-group">
        <label>Tipo de armazenamento *</label>
        <select id="photo-storage-type">
          <option value="gdrive">Google Drive</option>
          <option value="onedrive">OneDrive</option>
          <option value="network">Pasta de Rede</option>
          <option value="inline">URL direta</option>
        </select>
      </div>
      <div class="form-group">
        <label>ID do arquivo / Caminho / URL *</label>
        <input type="text" id="photo-storage-ref" placeholder="ID do Google Drive, URL ou caminho de rede">
      </div>
      <div class="form-group">
        <label>Nome do arquivo *</label>
        <input type="text" id="photo-file-name" placeholder="foto-joao-silva.jpg">
      </div>
      <div class="form-group">
        <label>Enviado por *</label>
        <input type="text" id="photo-uploaded-by" placeholder="Seu nome">
      </div>
      <div class="form-group">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="photo-consent" ${emp.image_consent ? 'checked' : ''}>
          <span>📷 Funcionário autorizou uso de imagem (LGPD)</span>
        </label>
      </div>`,
    confirmLabel: 'Registrar Foto',
    onConfirm: async (overlay, close) => {
      const storageType = overlay.querySelector('#photo-storage-type').value;
      const storageRef  = overlay.querySelector('#photo-storage-ref').value.trim();
      const fileName    = overlay.querySelector('#photo-file-name').value.trim();
      const uploadedBy  = overlay.querySelector('#photo-uploaded-by').value.trim();
      const consent     = overlay.querySelector('#photo-consent').checked;

      if (!storageRef) { showToast('Informe o ID/caminho do arquivo.', 'warning'); return; }
      if (!fileName)   { showToast('Informe o nome do arquivo.', 'warning'); return; }
      if (!uploadedBy) { showToast('Informe quem está registrando.', 'warning'); return; }

      try {
        await api(`/employees/${emp.id}/photo`, {
          method: 'POST',
          body: JSON.stringify({ storage_type: storageType, storage_ref: storageRef, file_name: fileName, uploaded_by: uploadedBy, image_consent: consent }),
        });
        showToast('Foto registrada.', 'success');
        close();
      } catch (e) { showToast(e.message, 'error'); }
    },
  });

  setTimeout(() => {
    document.getElementById('photo-del-btn')?.addEventListener('click', async () => {
      try {
        await api(`/employees/${emp.id}/photo`, { method: 'DELETE', body: JSON.stringify({}) });
        showToast('Foto removida.', 'success');
        document.getElementById('modal-close-btn')?.click();
      } catch (e) { showToast(e.message, 'error'); }
    });
  }, 100);
}

/* ─── Modal: Documentos do Funcionário ──────────────────────── */
const DOC_TYPE_LABELS = {
  monthly_acceptance:  'Aceite da Folha Mensal',
  hardware_consent:    'Conformidade — Hardware Próprio',
  digital_consent:     'Conformidade — Aceite Digital',
  image_consent:       'Autorização de Uso de Imagem',
  employment_contract: 'Contrato de Trabalho / CTPS',
  admissional_exam:    'Exame Admissional',
  dismissal_exam:      'Exame Demissional',
  nda:                 'Acordo de Confidencialidade',
  other:               'Outro Documento',
};

async function openEmployeeDocsModal(emp) {
  let docs = [];
  try { docs = await api(`/employees/${emp.id}/documents?orgId=${_orgId}`); } catch (_) {}

  // Renderiza lista de documentos + formulário para arquivar novo
  openModal({
    title: `📁 Documentos — ${E(emp.name)}`,
    bodyHtml: `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:13px;color:#374151">${docs.length} documento(s) arquivado(s)</strong>
          <button class="btn btn-ghost btn-sm" id="doc-gen-btn">✨ Gerar Documento Legal</button>
        </div>
        ${docs.length ? `
        <div class="table-wrapper">
          <table class="data-table" style="font-size:12px">
            <thead><tr><th>Tipo</th><th>Arquivo</th><th>Período</th><th>Arquivado em</th><th>Storage</th><th>Ação</th></tr></thead>
            <tbody>
              ${docs.map(d => `<tr>
                <td><strong>${E(DOC_TYPE_LABELS[d.doc_type] || d.doc_type)}</strong>${d.doc_label ? `<br><small>${E(d.doc_label)}</small>` : ''}</td>
                <td><a href="${E(d.storage_ref)}" target="_blank" rel="noopener" style="color:#2563eb">${E(d.file_name)}</a></td>
                <td>${E(d.reference_period || '—')}</td>
                <td>${fmtDate(d.archived_at)}<br><small style="color:#9ca3af">por ${E(d.archived_by)}</small></td>
                <td><span style="font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${E(d.storage_type)}</span></td>
                <td><button class="btn btn-ghost btn-sm doc-revoke-btn" data-doc-id="${d.id}" style="color:#dc2626;font-size:11px" title="Revogar">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p style="color:#9ca3af;font-size:13px">Nenhum documento arquivado ainda.</p>'}
      </div>
      <hr style="margin:12px 0;border-color:#e5e7eb">
      <p style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">📎 Arquivar Novo Documento</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#92400e">
        ℹ️ O sistema registra a <strong>existência e localização</strong> do arquivo de forma permanente.
        A existência do arquivo depende da manutenção do sistema de armazenamento utilizado.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label>Tipo do Documento *</label>
          <select id="ndoc-type">
            ${Object.entries(DOC_TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="ndoc-label-wrap" style="display:none">
          <label>Descrição do Documento *</label>
          <input type="text" id="ndoc-label" placeholder="Ex: Acordo de compensação de horas">
        </div>
        <div class="form-group">
          <label>Período de Referência (se aplicável)</label>
          <input type="month" id="ndoc-period">
        </div>
        <div class="form-group">
          <label>Tipo de Armazenamento *</label>
          <select id="ndoc-storage-type">
            <option value="gdrive">Google Drive</option>
            <option value="onedrive">OneDrive</option>
            <option value="network">Pasta de Rede</option>
            <option value="inline">URL direta</option>
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Localização do Arquivo (ID, URL ou caminho) *</label>
          <input type="text" id="ndoc-ref" placeholder="ID do Drive, URL, ou \\\\servidor\\pasta\\arquivo.pdf">
        </div>
        <div class="form-group">
          <label>Nome do Arquivo *</label>
          <input type="text" id="ndoc-filename" placeholder="documento.pdf">
        </div>
        <div class="form-group">
          <label>Arquivado por *</label>
          <input type="text" id="ndoc-by" placeholder="Seu nome">
        </div>
        <div class="form-group">
          <label>Data de Assinatura (no documento)</label>
          <input type="date" id="ndoc-signed">
        </div>
        <div class="form-group">
          <label>Observações</label>
          <input type="text" id="ndoc-notes" placeholder="Opcional">
        </div>
      </div>`,
    confirmLabel: '📎 Arquivar Documento',
    onConfirm: async (overlay, close) => {
      const docType     = overlay.querySelector('#ndoc-type').value;
      const docLabel    = overlay.querySelector('#ndoc-label')?.value.trim();
      const period      = overlay.querySelector('#ndoc-period').value;
      const storageType = overlay.querySelector('#ndoc-storage-type').value;
      const ref         = overlay.querySelector('#ndoc-ref').value.trim();
      const fileName    = overlay.querySelector('#ndoc-filename').value.trim();
      const archivedBy  = overlay.querySelector('#ndoc-by').value.trim();
      const signed      = overlay.querySelector('#ndoc-signed').value;
      const notes       = overlay.querySelector('#ndoc-notes').value.trim();

      if (!ref)        { showToast('Informe a localização do arquivo.', 'warning'); return; }
      if (!fileName)   { showToast('Informe o nome do arquivo.', 'warning'); return; }
      if (!archivedBy) { showToast('Informe quem está arquivando.', 'warning'); return; }
      if (docType === 'other' && !docLabel) { showToast('Informe a descrição do documento.', 'warning'); return; }

      try {
        await api(`/employees/${emp.id}/documents`, {
          method: 'POST',
          body: JSON.stringify({
            doc_type: docType, doc_label: docLabel || null, reference_period: period || null,
            storage_type: storageType, storage_ref: ref, file_name: fileName,
            content_type: 'application/pdf', archived_by: archivedBy,
            signed_at: signed || null, notes: notes || null,
          }),
        });
        showToast('Documento arquivado.', 'success');
        close();
      } catch (e) { showToast(e.message, 'error'); }
    },
  });

  // Revogar doc
  setTimeout(() => {
    document.querySelectorAll('.doc-revoke-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Motivo da revogação:');
        if (!reason) return;
        try {
          await api(`/employees/${emp.id}/documents/${btn.dataset.docId}/revoke`, {
            method: 'PUT', body: JSON.stringify({ reason }),
          });
          showToast('Documento revogado.', 'success');
          document.getElementById('modal-close-btn')?.click();
        } catch (e) { showToast(e.message, 'error'); }
      });
    });

    // Mostrar/ocultar campo doc_label
    document.getElementById('ndoc-type')?.addEventListener('change', ev => {
      const wrap = document.getElementById('ndoc-label-wrap');
      if (wrap) wrap.style.display = ev.target.value === 'other' ? '' : 'none';
    });

    // Botão gerar doc legal
    document.getElementById('doc-gen-btn')?.addEventListener('click', () => openDocGeneratorModal(emp));
  }, 100);
}

/* ─── Modal: Gerador de Documentos Legais ────────────────────── */
async function openDocGeneratorModal(emp) {
  const genDocs = [
    { value: 'monthly_acceptance', label: 'Aceite da Folha Mensal' },
    { value: 'hardware_consent',   label: 'Conformidade — Hardware Próprio' },
    { value: 'digital_consent',    label: 'Conformidade — Aceite Digital' },
    { value: 'image_consent',      label: 'Autorização de Uso de Imagem' },
    { value: 'nda',                label: 'Acordo de Confidencialidade (NDA)' },
  ];

  openModal({
    title: '✨ Gerar Documento Legal',
    bodyHtml: `
      <p style="color:#374151;font-size:13px;margin-bottom:12px">
        Selecione o tipo de documento para gerar o texto padrão dentro da conformidade legal.<br>
        Após gerado, imprima, assine, digitalize e registre o arquivo.
      </p>
      <div class="form-group">
        <label>Tipo de Documento *</label>
        <select id="gen-doc-type">
          ${genDocs.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="gen-period-wrap">
        <label>Período de Referência (apenas para Aceite Mensal)</label>
        <input type="month" id="gen-period" value="${new Date().toISOString().slice(0,7)}">
      </div>
      <div id="gen-preview" style="display:none;margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:13px;color:#374151">Prévia do Documento</strong>
          <button class="btn btn-ghost btn-sm" id="gen-copy-btn">📋 Copiar</button>
          <button class="btn btn-ghost btn-sm" id="gen-print-btn">🖨️ Imprimir</button>
        </div>
        <textarea id="gen-text" rows="16" style="width:100%;font-family:monospace;font-size:12px;color:#111827;border:1px solid #d1d5db;border-radius:6px;padding:10px;resize:vertical" readonly></textarea>
      </div>`,
    confirmLabel: '📄 Gerar Prévia',
    cancelLabel: 'Fechar',
    onConfirm: async (overlay) => {
      const docType = overlay.querySelector('#gen-doc-type').value;
      const period  = overlay.querySelector('#gen-period').value;
      try {
        const result = await api(`/employees/${emp.id}/documents/generate`, {
          method: 'POST',
          body: JSON.stringify({ doc_type: docType, reference_period: period || null }),
        });
        const preview = overlay.querySelector('#gen-preview');
        const textEl  = overlay.querySelector('#gen-text');
        if (preview && textEl) {
          textEl.value = result.content;
          preview.style.display = '';
        }
      } catch (e) { showToast(e.message, 'error'); }
    },
  });

  setTimeout(() => {
    document.getElementById('gen-doc-type')?.addEventListener('change', ev => {
      const w = document.getElementById('gen-period-wrap');
      if (w) w.style.display = ev.target.value === 'monthly_acceptance' ? '' : 'none';
    });
    document.getElementById('gen-copy-btn')?.addEventListener('click', () => {
      const text = document.getElementById('gen-text')?.value;
      if (text) { navigator.clipboard.writeText(text).then(() => showToast('Copiado!', 'success')); }
    });
    document.getElementById('gen-print-btn')?.addEventListener('click', () => {
      const text = document.getElementById('gen-text')?.value;
      if (!text) return;
      const w = window.open('', '_blank');
      const logoHtml = _logoUrl
        ? `<div style="margin-bottom:20px"><img src="${_logoUrl}" alt="Logo" style="max-height:70px;max-width:220px;object-fit:contain"></div>`
        : '';
      const orgLine = _displayOrgName
        ? `<div style="font-size:15pt;font-weight:bold;margin-bottom:4px">${_displayOrgName.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`
        : '';
      const hasHeader = logoHtml || orgLine;
      w.document.write(`<html><head><title>Documento</title><style>
body{font-family:Arial,sans-serif;font-size:11pt;padding:40px;max-width:800px;margin:0 auto}
.doc-header{padding-bottom:16px;border-bottom:2px solid #111;margin-bottom:24px}
pre{white-space:pre-wrap;font-family:inherit;font-size:inherit;line-height:1.6}
@media print{body{padding:20px}}
</style></head><body>${hasHeader ? `<div class="doc-header">${logoHtml}${orgLine}</div>` : ''}<pre>${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`);
      w.document.close();
      w.print();
    });
  }, 100);
}

/* ─── Aba: Períodos Mensais ──────────────────────────────────── */
async function renderPeriodos(container) {
  container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const [periods, settings] = await Promise.all([
      apiGet('/periods'),
      apiGet('/settings'),
    ]);
    const closeDay = settings?.monthly_close_day ?? 0;
    const closeDayLabel = closeDay === 0 ? 'último dia do mês' : `dia ${closeDay}`;

    const STATUS = {
      open:   '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#065f46;background:#d1fae5">🟢 Aberto</span>',
      closed: '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#1e40af;background:#dbeafe">🔒 Fechado</span>',
    };

    const rows = (periods || []).map(p => `
      <tr>
        <td><strong>${E(p.period_month)}</strong></td>
        <td>${E(p.start_date)} → ${E(p.end_date)}</td>
        <td>${STATUS[p.status] || E(p.status)}</td>
        <td>${p.total_employees != null ? p.total_employees : '—'}</td>
        <td>${p.total_records != null ? p.total_records : '—'}</td>
        <td>${p.closed_at ? `${fmtDate(p.closed_at)}<br><small style="color:#9ca3af">por ${E(p.closed_by)}</small>` : '—'}</td>
        <td>
          ${p.status === 'open' ? `<button class="btn btn-ghost btn-sm period-close-btn" data-period="${E(p.period_month)}" style="color:#dc2626">🔒 Fechar</button>` : ''}
        </td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="ponto-section-header">
        <div>
          <span style="font-size:13px;color:#6b7280">Fechamento configurado: <strong>${closeDayLabel}</strong></span>
        </div>
        <div style="display:flex;gap:8px">
          <input type="month" id="per-new-month" value="${new Date().toISOString().slice(0,7)}" class="input-sm">
          <button class="btn btn-primary btn-sm" id="per-open-btn">+ Abrir Período</button>
        </div>
      </div>
      ${periods?.length ? `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Período</th><th>Datas</th><th>Status</th><th>Funcionários</th><th>Registros</th><th>Fechado em</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div class="ponto-empty"><p>Nenhum período aberto ainda.</p></div>'}
      <div style="margin-top:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:12px;color:#92400e">
        <strong>ℹ️ Sobre o fechamento de períodos:</strong><br>
        Fechar um período consolida os totais e registra a data de fechamento por auditoria.
        Isso não impede a visualização dos registros — apenas formaliza o encerramento da jornada mensal.
        Configure o dia de fechamento em ⚙️ Configurações.
      </div>`;

    document.getElementById('per-open-btn')?.addEventListener('click', async () => {
      const month = document.getElementById('per-new-month')?.value;
      if (!month) { showToast('Selecione o mês.', 'warning'); return; }
      try {
        await apiPost('/periods/open', { period_month: month });
        showToast('Período aberto.', 'success');
        await renderPeriodos(container);
      } catch (e) { showToast(e.message, 'error'); }
    });

    container.querySelectorAll('.period-close-btn').forEach(btn => {
      btn.addEventListener('click', () => openClosePeriodoModal(btn.dataset.period, container));
    });
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

async function openClosePeriodoModal(period, container) {
  openModal({
    title: `🔒 Fechar Período — ${period}`,
    bodyHtml: `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px">
        ⚠️ Fechar o período consolida os totais e registra formalmente o encerramento.<br>
        Os registros permanecem disponíveis para visualização e exportação.
      </div>
      <div class="form-group">
        <label>Fechado por (seu nome) *</label>
        <input type="text" id="pc-by" placeholder="Nome do responsável">
      </div>
      <div class="form-group">
        <label>Observações (opcional)</label>
        <textarea id="pc-notes" rows="2" placeholder="Ex: Período encerrado sem pendências."></textarea>
      </div>`,
    confirmLabel: '🔒 Confirmar Fechamento',
    confirmClass: 'btn-danger',
    onConfirm: async (overlay, close) => {
      const by    = overlay.querySelector('#pc-by').value.trim();
      const notes = overlay.querySelector('#pc-notes').value.trim();
      if (!by) { showToast('Informe quem está fechando o período.', 'warning'); return; }
      try {
        await apiPost('/periods/close', { period_month: period, closed_by: by, close_notes: notes || null });
        showToast(`Período ${period} fechado.`, 'success');
        close();
        await renderPeriodos(container);
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

/* ─── Aba: Dispositivos Kiosque ──────────────────────────────── */
function bindOrgBannerCopy(container) {
  container.querySelector('#copy-orgid-btn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(_orgId).then(() => showToast('ID copiado!', 'success'));
  });
  container.querySelector('#org-id-display')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(_orgId).then(() => showToast('ID copiado!', 'success'));
  });
}

async function renderDispositivos(container) {
  container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const devices = await apiGet('/devices');

    const STATUS_BADGE = {
      pending: '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#92400e;background:#fef3c7">⏳ Aguardando</span>',
      active:  '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#065f46;background:#d1fae5">✅ Autorizado</span>',
      blocked: '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#991b1b;background:#fee2e2">🚫 Bloqueado</span>',
    };

    // Banner com o orgId para copiar no setup do kiosque
    const orgBanner = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e40af;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span>🖥️ <strong>ID da Organização</strong> (use no setup do app kiosque):</span>
        <code id="org-id-display" style="font-size:12px;color:#1e3a8a;background:#dbeafe;padding:3px 8px;border-radius:4px;cursor:pointer;user-select:all" title="Clique para copiar">${E(_orgId)}</code>
        <button class="btn btn-ghost btn-sm" id="copy-orgid-btn" style="font-size:12px">📋 Copiar</button>
        <a href="/kiosque/" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size:12px">🔗 Abrir Kiosque</a>
      </div>`;

    if (!devices?.length) {
      container.innerHTML = orgBanner + `
        <div class="ponto-empty">
          <span style="font-size:40px">🖥️</span>
          <p>Nenhum dispositivo cadastrado.</p>
          <p style="font-size:13px;color:#6b7280;max-width:400px">
            Dispositivos kiosque são cadastrados automaticamente ao acessar <strong>/kiosque/</strong>.
            Após o cadastro, autorize o dispositivo aqui.
          </p>
        </div>`;
      bindOrgBannerCopy(container);
      return;
    }

    const rows = devices.map(d => `
      <tr>
        <td>
          <strong>${E(d.name)}</strong><br>
          <small style="color:#9ca3af">${E(d.model || d.platform || '—')}</small>
        </td>
        <td>${STATUS_BADGE[d.status] || E(d.status)}</td>
        <td style="font-size:11px;color:#6b7280">${E(d.hardware_id.substring(0, 8))}...</td>
        <td>${d.last_seen_at ? fmtDate(d.last_seen_at) : '—'}</td>
        <td style="font-size:11px">${d.biometric_support ? '✅ Sim' : '—'}</td>
        <td>
          ${d.status === 'pending' ? `<button class="btn btn-primary btn-sm dev-auth-btn" data-dev-id="${d.id}">✅ Autorizar</button>` : ''}
          ${d.status === 'active'  ? `<button class="btn btn-ghost btn-sm dev-block-btn" data-dev-id="${d.id}" style="color:#dc2626">🚫 Bloquear</button>` : ''}
          ${d.status === 'blocked' ? `<button class="btn btn-ghost btn-sm dev-unblock-btn" data-dev-id="${d.id}">🔓 Desbloquear</button>` : ''}
          <button class="btn btn-ghost btn-sm dev-edit-btn" data-dev-id="${d.id}">✏️</button>
        </td>
      </tr>`).join('');

    container.innerHTML = orgBanner + `
      <div class="ponto-section-header">
        <span>${devices.filter(d => d.status === 'active').length} autorizado(s) · ${devices.filter(d => d.status === 'pending').length} aguardando · ${devices.filter(d => d.status === 'blocked').length} bloqueado(s)</span>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#1e40af">
        🖥️ Dispositivos kiosque são cadastrados automaticamente ao acessar <strong>/kiosque/</strong>. Somente dispositivos <strong>autorizados</strong> aceitam registros de ponto.
        Dispositivos podem ser <strong>bloqueados</strong> mas nunca excluídos do sistema (auditoria permanente).
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Nome / Modelo</th><th>Status</th><th>Hardware ID</th><th>Último Uso</th><th>Biometria</th><th>Ações</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    bindOrgBannerCopy(container);
    container.querySelectorAll('.dev-auth-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeviceActionModal(btn.dataset.devId, 'authorize', container));
    });
    container.querySelectorAll('.dev-block-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeviceActionModal(btn.dataset.devId, 'block', container));
    });
    container.querySelectorAll('.dev-unblock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await apiPut(`/devices/${btn.dataset.devId}`, { action: 'unblock' });
          showToast('Dispositivo desbloqueado. Autorize-o novamente para uso.', 'success');
          await renderDispositivos(container);
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
    container.querySelectorAll('.dev-edit-btn').forEach(btn => {
      const dev = devices.find(d => d.id === btn.dataset.devId);
      btn.addEventListener('click', () => openDeviceEditModal(dev, container));
    });
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

async function openDeviceActionModal(deviceId, action, container) {
  const isAuth  = action === 'authorize';
  const isBlock = action === 'block';

  openModal({
    title: isAuth ? '✅ Autorizar Dispositivo' : '🚫 Bloquear Dispositivo',
    bodyHtml: `
      ${isAuth ? `
      <p style="color:#374151;font-size:13px">Ao autorizar, este dispositivo poderá registrar pontos para qualquer funcionário ativo da organização.</p>
      <div class="form-group">
        <label>Autorizado por (seu nome) *</label>
        <input type="text" id="dev-action-by" placeholder="Nome do responsável">
      </div>` : ''}
      ${isBlock ? `
      <p style="color:#dc2626;font-size:13px">⚠️ Após o bloqueio, este dispositivo não aceita novos registros de ponto.</p>
      <div class="form-group">
        <label>Motivo do Bloqueio *</label>
        <textarea id="dev-block-reason" rows="2" placeholder="Ex: Dispositivo perdido, furtado ou danificado"></textarea>
      </div>` : ''}`,
    confirmLabel: isAuth ? '✅ Autorizar' : '🚫 Bloquear',
    confirmClass: isAuth ? 'btn-success' : 'btn-danger',
    onConfirm: async (overlay, close) => {
      const body = { action };
      if (isAuth) {
        const by = overlay.querySelector('#dev-action-by')?.value.trim();
        if (!by) { showToast('Informe o responsável.', 'warning'); return; }
        body.authorized_by = by;
      }
      if (isBlock) {
        const reason = overlay.querySelector('#dev-block-reason')?.value.trim();
        if (!reason) { showToast('Informe o motivo do bloqueio.', 'warning'); return; }
        body.block_reason = reason;
      }
      try {
        await apiPut(`/devices/${deviceId}`, body);
        showToast(isAuth ? 'Dispositivo autorizado.' : 'Dispositivo bloqueado.', 'success');
        close();
        await renderDispositivos(container);
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

async function openDeviceEditModal(dev, container) {
  openModal({
    title: '✏️ Editar Dispositivo',
    bodyHtml: `
      <div class="form-group">
        <label>Nome do Dispositivo</label>
        <input type="text" id="dev-name" value="${E(dev?.name || '')}" placeholder="Ex: Totem Entrada Principal">
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="dev-notes" rows="2" placeholder="Localização, observações...">${E(dev?.notes || '')}</textarea>
      </div>`,
    confirmLabel: 'Salvar',
    onConfirm: async (overlay, close) => {
      const name  = overlay.querySelector('#dev-name').value.trim();
      const notes = overlay.querySelector('#dev-notes').value.trim();
      try {
        await apiPut(`/devices/${dev.id}`, { name, notes });
        showToast('Dispositivo atualizado.', 'success');
        close();
        await renderDispositivos(container);
      } catch (e) { showToast(e.message, 'error'); }
    },
  });
}

/* ─── Aba: Configurações ─────────────────────────────────────── */
async function renderConfiguracoes(container) {
  container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
  try {
    const settings = await apiGet('/settings');
    renderConfigForm(container, settings);
  } catch (e) {
    container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
  }
}

function renderConfigForm(container, s) {
  const ipList = (s?.ip_whitelist || []).join(', ');

  container.innerHTML = `
    <div style="max-width:720px">

      <!-- Identidade Visual -->
      <div class="config-section">
        <h3 class="config-section-title">🏢 Identidade Visual da Empresa</h3>
        <div style="display:grid;grid-template-columns:1fr;gap:12px">
          <div class="form-group">
            <label>Nome de Exibição da Empresa</label>
            <input type="text" id="cfg-display-name" value="${E(s?.org_display_name || '')}" placeholder="Nome que aparecerá nos documentos e no kiosque (deixe em branco para usar o nome cadastrado)">
          </div>
          <div class="form-group">
            <label>URL da Logo (https://)</label>
            <div style="display:flex;gap:10px;align-items:flex-start">
              <div style="flex:1">
                <input type="url" id="cfg-logo-url" value="${E(s?.logo_url || '')}" placeholder="https://drive.google.com/uc?id=... ou URL pública da imagem">
                <small style="color:#9ca3af;font-size:11px">Use uma URL pública (Google Drive com compartilhamento público, OneDrive, CDN, etc.)</small>
              </div>
              <div id="cfg-logo-preview" style="width:80px;height:48px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#f9fafb;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${s?.logo_url ? `<img src="${E(s.logo_url)}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.parentElement.innerHTML='<span style=\\'font-size:10px;color:#9ca3af;text-align:center;padding:4px\\'>Erro ao carregar</span>'">` : '<span style="font-size:20px">🏢</span>'}
              </div>
            </div>
          </div>
          <div>
            <label class="config-toggle" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" id="cfg-logo-docs" ${s?.logo_show_in_docs !== false ? 'checked' : ''}>
              <span>Incluir logo nos documentos gerados (folha mensal, termos, contratos)</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Assinaturas -->
      <div class="config-section">
        <h3 class="config-section-title">📄 Assinaturas da Folha Mensal</h3>
        <label class="config-toggle">
          <input type="checkbox" id="cfg-e-sign" ${s?.allow_electronic_signature !== false ? 'checked' : ''}>
          <span>✅ Aceite eletrônico (clique do funcionário no app)</span>
        </label>
        <label class="config-toggle">
          <input type="checkbox" id="cfg-p-sign" ${s?.allow_physical_signature !== false ? 'checked' : ''}>
          <span>📄 Envio de scan físico assinado</span>
        </label>
      </div>

      <!-- Foto do Funcionário -->
      <div class="config-section">
        <h3 class="config-section-title">📷 Foto do Funcionário</h3>
        <label class="config-toggle">
          <input type="checkbox" id="cfg-photo-on" ${s?.photo_enabled ? 'checked' : ''}>
          <span>Habilitar foto dos funcionários</span>
        </label>
        <div id="cfg-photo-opts" style="${s?.photo_enabled ? '' : 'display:none'}">
          <div style="background:#fce7f3;border:1px solid #fbcfe8;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12px;color:#9d174d">
            ⚠️ A foto será armazenada no serviço externo configurado abaixo. O sistema Ponto apenas registra a localização do arquivo — sua existência depende da manutenção do storage.
            Exige consentimento LGPD do funcionário (cadastrado no perfil de cada funcionário).
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
            <div class="form-group">
              <label>Serviço de Armazenamento</label>
              <select id="cfg-photo-storage">
                <option value="gdrive"   ${s?.photo_storage_type === 'gdrive'   ? 'selected' : ''}>Google Drive</option>
                <option value="onedrive" ${s?.photo_storage_type === 'onedrive' ? 'selected' : ''}>OneDrive</option>
                <option value="network"  ${s?.photo_storage_type === 'network'  ? 'selected' : ''}>Pasta de Rede</option>
              </select>
            </div>
            <div class="form-group">
              <label>ID da Pasta / Caminho de Rede</label>
              <input type="text" id="cfg-photo-folder" value="${E(s?.photo_storage_folder_id || '')}" placeholder="ID do Drive ou \\\\servidor\\pasta">
            </div>
            <div class="form-group">
              <label>Excluir fotos após (dias)</label>
              <input type="number" id="cfg-photo-delete" value="${s?.photo_auto_delete_days || 0}" min="0" max="3650" placeholder="0 = não excluir">
              <small style="color:#9ca3af">0 = não excluir automaticamente</small>
            </div>
            <div class="form-group">
              <label class="config-toggle" style="margin-top:24px">
                <input type="checkbox" id="cfg-photo-sample" ${s?.photo_sample_on_punch ? 'checked' : ''}>
                <span>Abrir por amostragem no batimento de ponto</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Registro de IP -->
      <div class="config-section">
        <h3 class="config-section-title">🌐 Registro e Restrição de IP</h3>
        <label class="config-toggle">
          <input type="checkbox" id="cfg-ip-rec" ${s?.ip_recording_enabled ? 'checked' : ''}>
          <span>Registrar IP do dispositivo em cada batimento</span>
        </label>
        <label class="config-toggle" style="margin-top:8px">
          <input type="checkbox" id="cfg-ip-restrict" ${s?.ip_restriction_enabled ? 'checked' : ''}>
          <span>Restringir ponto a IPs autorizados</span>
        </label>
        <div id="cfg-ip-opts" style="${s?.ip_restriction_enabled ? '' : 'display:none'}">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12px;color:#1e40af">
            ℹ️ Informe os IPs ou prefixos de rede permitidos (um por linha ou separados por vírgula). Exemplo: 192.168.1.0, 10.0.0.1
          </div>
          <div class="form-group">
            <label>IPs Autorizados</label>
            <textarea id="cfg-ip-list" rows="3" placeholder="192.168.1.0&#10;10.0.0.1&#10;172.16.0.0">${E(ipList)}</textarea>
          </div>
        </div>
      </div>

      <!-- Kiosque -->
      <div class="config-section">
        <h3 class="config-section-title">🖥️ Modo Kiosque (Dispositivo Compartilhado)</h3>
        <label class="config-toggle">
          <input type="checkbox" id="cfg-kiosk" ${s?.kiosk_mode_enabled ? 'checked' : ''}>
          <span>Habilitar ponto por dispositivo compartilhado</span>
        </label>
        <div id="cfg-kiosk-info" style="${s?.kiosk_mode_enabled ? '' : 'display:none'}">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12px;color:#14532d">
            ✅ No modo kiosque, o funcionário identifica-se pelo código (PIN) ou biometria cadastrada no dispositivo.<br>
            <strong>Não</strong> registra GPS nem IP — apenas o nome do dispositivo é registrado.<br>
            Configure e autorize os dispositivos na aba 🖥️ Dispositivos.
          </div>
        </div>
      </div>

      <!-- Fechamento Mensal -->
      <div class="config-section">
        <h3 class="config-section-title">🗓️ Fechamento Mensal da Jornada</h3>
        <div class="form-group">
          <label>Dia de Fechamento do Período</label>
          <div style="display:flex;align-items:center;gap:12px">
            <input type="number" id="cfg-close-day" value="${s?.monthly_close_day || 0}" min="0" max="28" style="width:80px">
            <span style="font-size:13px;color:#6b7280">0 = último dia do mês · 1–28 = dia fixo</span>
          </div>
          <small style="color:#9ca3af">Exemplo: dia 25 = o período vai do dia 26 do mês anterior até o dia 25 do mês atual.</small>
        </div>
      </div>

      <!-- Documentos -->
      <div class="config-section">
        <h3 class="config-section-title">📁 Armazenamento de Documentos</h3>
        <label class="config-toggle">
          <input type="checkbox" id="cfg-auto-docs" ${s?.auto_generate_docs !== false ? 'checked' : ''}>
          <span>Gerar documentos legais automaticamente no cadastro de funcionários</span>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
          <div class="form-group">
            <label>Serviço de Armazenamento</label>
            <select id="cfg-docs-storage">
              <option value="">— Não configurado —</option>
              <option value="gdrive"   ${s?.docs_storage_type === 'gdrive'   ? 'selected' : ''}>Google Drive</option>
              <option value="onedrive" ${s?.docs_storage_type === 'onedrive' ? 'selected' : ''}>OneDrive</option>
              <option value="network"  ${s?.docs_storage_type === 'network'  ? 'selected' : ''}>Pasta de Rede</option>
            </select>
          </div>
          <div class="form-group">
            <label>Pasta Raiz (ID ou caminho)</label>
            <input type="text" id="cfg-docs-folder" value="${E(s?.docs_storage_folder_id || '')}" placeholder="ID do Drive ou \\\\servidor\\pasta\\docs">
          </div>
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-top:8px;font-size:12px;color:#92400e">
          ℹ️ O sistema registra permanentemente a existência e localização de cada documento.
          A existência do arquivo físico depende da manutenção do serviço de armazenamento escolhido.
          Documentos obrigatórios por lei: folha de aceite mensal, conformidade de hardware próprio, conformidade de aceite digital, autorização de uso de imagem (quando aplicável).
        </div>
      </div>

      <div style="margin-top:20px">
        <button class="btn btn-primary" id="cfg-save-btn">💾 Salvar Configurações</button>
      </div>
    </div>`;

  // Toggle visibilidade dos sub-painéis
  document.getElementById('cfg-photo-on')?.addEventListener('change', ev => {
    const opts = document.getElementById('cfg-photo-opts');
    if (opts) opts.style.display = ev.target.checked ? '' : 'none';
  });
  document.getElementById('cfg-ip-restrict')?.addEventListener('change', ev => {
    const opts = document.getElementById('cfg-ip-opts');
    if (opts) opts.style.display = ev.target.checked ? '' : 'none';
  });
  document.getElementById('cfg-kiosk')?.addEventListener('change', ev => {
    const info = document.getElementById('cfg-kiosk-info');
    if (info) info.style.display = ev.target.checked ? '' : 'none';
  });

  // Live preview da logo
  document.getElementById('cfg-logo-url')?.addEventListener('input', function () {
    const preview = document.getElementById('cfg-logo-preview');
    if (!preview) return;
    const url = this.value.trim();
    if (url && url.startsWith('https://')) {
      preview.innerHTML = `<img src="${E(url)}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.parentElement.innerHTML='<span style=\\'font-size:10px;color:#9ca3af;text-align:center;padding:4px\\'>Erro ao carregar</span>'">`;
    } else {
      preview.innerHTML = '<span style="font-size:20px">🏢</span>';
    }
  });

  document.getElementById('cfg-save-btn')?.addEventListener('click', async () => {
    const allowElectronic = document.getElementById('cfg-e-sign')?.checked ?? true;
    const allowPhysical   = document.getElementById('cfg-p-sign')?.checked ?? true;
    if (!allowElectronic && !allowPhysical) {
      showToast('Pelo menos um método de assinatura deve ser habilitado.', 'warning');
      return;
    }

    // Parseia lista de IPs
    const ipRaw = document.getElementById('cfg-ip-list')?.value || '';
    const ipList = ipRaw.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 0);

    const closeDay = parseInt(document.getElementById('cfg-close-day')?.value || '0', 10);
    if (isNaN(closeDay) || closeDay < 0 || closeDay > 28) {
      showToast('Dia de fechamento deve ser entre 0 e 28.', 'warning');
      return;
    }

    const logoUrl = document.getElementById('cfg-logo-url')?.value.trim() || null;
    if (logoUrl && !logoUrl.startsWith('https://')) {
      showToast('A URL da logo deve começar com https://', 'warning');
      return;
    }

    try {
      const btn = document.getElementById('cfg-save-btn');
      btn.disabled = true;
      btn.textContent = 'Salvando...';

      await apiPut('/settings', {
        allow_electronic_signature: allowElectronic,
        allow_physical_signature:   allowPhysical,
        photo_enabled:           document.getElementById('cfg-photo-on')?.checked ?? false,
        photo_storage_type:      document.getElementById('cfg-photo-storage')?.value || null,
        photo_storage_folder_id: document.getElementById('cfg-photo-folder')?.value.trim() || null,
        photo_auto_delete_days:  parseInt(document.getElementById('cfg-photo-delete')?.value || '0', 10),
        photo_sample_on_punch:   document.getElementById('cfg-photo-sample')?.checked ?? false,
        ip_recording_enabled:    document.getElementById('cfg-ip-rec')?.checked ?? false,
        ip_restriction_enabled:  document.getElementById('cfg-ip-restrict')?.checked ?? false,
        ip_whitelist:            ipList,
        kiosk_mode_enabled:      document.getElementById('cfg-kiosk')?.checked ?? false,
        monthly_close_day:       closeDay,
        auto_generate_docs:      document.getElementById('cfg-auto-docs')?.checked ?? true,
        docs_storage_type:       document.getElementById('cfg-docs-storage')?.value || null,
        docs_storage_folder_id:  document.getElementById('cfg-docs-folder')?.value.trim() || null,
        logo_url:                logoUrl,
        org_display_name:        document.getElementById('cfg-display-name')?.value.trim() || null,
        logo_show_in_docs:       document.getElementById('cfg-logo-docs')?.checked ?? true,
      });
      // Atualiza logo global e header imediatamente
      _logoUrl        = logoUrl;
      _displayOrgName = document.getElementById('cfg-display-name')?.value.trim() || null;
      const headerLogo = document.getElementById('app-header-logo');
      const headerIcon = document.getElementById('app-logo-icon-default');
      if (headerLogo && headerIcon) {
        if (_logoUrl) {
          headerLogo.src = _logoUrl;
          headerLogo.style.display = '';
          headerIcon.style.display = 'none';
        } else {
          headerLogo.style.display = 'none';
          headerIcon.style.display = '';
        }
      }
      showToast('Configurações salvas.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      const btn = document.getElementById('cfg-save-btn');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Configurações'; }
    }
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
    case 'periodos':     renderPeriodos(content);     break;
    case 'dispositivos': renderDispositivos(content); break;
    case 'configuracoes':renderConfiguracoes(content);break;
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

  // Carrega nome e logo da organização (settings + status em paralelo)
  Promise.all([
    apiGet('/status').catch(() => null),
    apiGet('/settings').catch(() => null),
  ]).then(([st, cfg]) => {
    const orgEl = document.getElementById('app-header-org');
    if (orgEl && st?.orgName) orgEl.textContent = cfg?.org_display_name || st.orgName;

    if (cfg?.logo_url) {
      _logoUrl       = cfg.logo_url;
      _displayOrgName = cfg.org_display_name || st?.orgName || '';
      const logoEl = document.getElementById('app-header-logo');
      if (logoEl) {
        logoEl.src   = _logoUrl;
        logoEl.style.display = 'block';
        const iconEl = document.getElementById('app-logo-icon-default');
        if (iconEl) iconEl.style.display = 'none';
      }
    }
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
