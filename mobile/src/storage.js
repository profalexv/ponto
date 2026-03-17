import * as SecureStore from 'expo-secure-store';

const KEYS = {
  TOKEN:       'ponto_emp_token',
  EMP_ID:      'ponto_emp_id',
  EMP_NAME:    'ponto_emp_name',
  ORG_ID:      'ponto_org_id',
  ORG_NAME:    'ponto_org_name',
  GPS_CONSENT: 'ponto_gps_consent',
};

export async function saveSession({ token, employeeId, name, orgId, orgName, gpsConsent }) {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.TOKEN,       token),
    SecureStore.setItemAsync(KEYS.EMP_ID,      String(employeeId)),
    SecureStore.setItemAsync(KEYS.EMP_NAME,    name),
    SecureStore.setItemAsync(KEYS.ORG_ID,      orgId),
    SecureStore.setItemAsync(KEYS.ORG_NAME,    orgName || ''),
    SecureStore.setItemAsync(KEYS.GPS_CONSENT, String(!!gpsConsent)),
  ]);
}

export async function loadSession() {
  const [token, employeeId, name, orgId, orgName, gpsConsent] = await Promise.all([
    SecureStore.getItemAsync(KEYS.TOKEN),
    SecureStore.getItemAsync(KEYS.EMP_ID),
    SecureStore.getItemAsync(KEYS.EMP_NAME),
    SecureStore.getItemAsync(KEYS.ORG_ID),
    SecureStore.getItemAsync(KEYS.ORG_NAME),
    SecureStore.getItemAsync(KEYS.GPS_CONSENT),
  ]);
  if (!token || !employeeId) return null;
  return {
    token,
    employeeId:  parseInt(employeeId, 10),
    name:        name || '',
    orgId:       orgId || '',
    orgName:     orgName || '',
    gpsConsent:  gpsConsent === 'true',
  };
}

export async function clearSession() {
  await Promise.all(Object.values(KEYS).map(k => SecureStore.deleteItemAsync(k)));
}
