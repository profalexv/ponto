const MOTOR_URL = 'https://aula-motor.fly.dev';

async function request(path, options = {}, token = null) {
  const url = `${MOTOR_URL}/api/ponto${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let body;
  try { body = await resp.json(); } catch { body = {}; }

  if (!resp.ok) throw new Error(body?.error || `Erro ${resp.status}`);
  return body.data ?? body;
}

/** Login do funcionário com CPF/e-mail + PIN */
export function authEmployee(org_id, identifier, pin) {
  return request('/mobile/auth', {
    method: 'POST',
    body: JSON.stringify({ org_id, identifier, pin }),
  });
}

/** Status atual: dados do funcionário + batidas de hoje */
export function getMe(token) {
  return request('/mobile/me', {}, token);
}

/** Registra uma batida de ponto */
export function punch(token, type, latitude = null, longitude = null, notes = '') {
  return request('/mobile/punch', {
    method: 'POST',
    body: JSON.stringify({ type, latitude, longitude, notes }),
  }, token);
}

/** Histórico paginado do funcionário */
export async function getHistory(token, cursor = null, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const url = `${MOTOR_URL}/api/ponto/mobile/history?${params}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body;
  try { body = await resp.json(); } catch { body = {}; }
  if (!resp.ok) throw new Error(body?.error || `Erro ${resp.status}`);
  return body; // retorna { data, nextCursor }
}
