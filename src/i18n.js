/**
 * i18n.js — Sistema de internacionalização leve
 *
 * Detecta o idioma do navegador e carrega o dicionário correspondente.
 * Uso: import { t, setLocale } from './i18n.js';
 *      t('sidebar.logout')  → "Sair" (pt-BR) / "Log out" (en) / "Salir" (es)
 */

// ── Dicionários ──────────────────────────────────────────────────────────────

const dictionaries = {
  'pt-BR': {
    // Navegação
    'nav.dashboard':     'Dashboard',
    'nav.contracts':     'Contratos',
    'nav.invoices':      'Faturas',
    'nav.plans':         'Planos',
    'nav.negotiations':  'Negociações',
    'nav.gateways':      'Gateways',
    'nav.subscription':  'Assinatura',
    'nav.students':      'Alunos',
    'nav.enrollments':   'Matrículas',
    'nav.transfers':     'Transferências',
    'nav.reports':       'Boletins',
    'nav.history':       'Histórico Acadêmico',
    'nav.attendance':    'Chamada',
    'nav.diary':         'Diário',
    'nav.occurrences':   'Ocorrências',
    'nav.periods':       'Períodos',
    'nav.assessments':   'Avaliações',
    'nav.grades':        'Notas',
    'nav.schedule':      'Cronograma',
    'nav.lesson':        'Aula',
    'nav.data':          'Dados',
    'nav.collaborators': 'Colaboradores',

    // Ações
    'action.logout':     'Sair ↩',
    'action.save':       'Salvar',
    'action.cancel':     'Cancelar',
    'action.delete':     'Excluir',
    'action.edit':       'Editar',
    'action.add':        'Adicionar',
    'action.search':     'Buscar',
    'action.filter':     'Filtrar',
    'action.export':     'Exportar',
    'action.close':      'Fechar',

    // Status
    'status.loading':    'Carregando…',
    'status.error':      'Erro ao carregar dados.',
    'status.empty':      'Nenhum registro encontrado.',
    'status.offline':    'Sem conexão',
    'status.syncing':    'Sincronizando…',
    'status.saved':      'Salvo com sucesso!',
    'status.denied':     '🚫 Acesso Restrito a Administradores.',

    // Auth
    'auth.email':        'E-mail',
    'auth.password':     'Senha',
    'auth.login':        'Entrar',
    'auth.logout_msg':   'Logout efetuado.',
  },

  en: {
    'nav.dashboard':     'Dashboard',
    'nav.contracts':     'Contracts',
    'nav.invoices':      'Invoices',
    'nav.plans':         'Plans',
    'nav.negotiations':  'Negotiations',
    'nav.gateways':      'Gateways',
    'nav.subscription':  'Subscription',
    'nav.students':      'Students',
    'nav.enrollments':   'Enrollments',
    'nav.transfers':     'Transfers',
    'nav.reports':       'Report Cards',
    'nav.history':       'Academic History',
    'nav.attendance':    'Attendance',
    'nav.diary':         'Diary',
    'nav.occurrences':   'Occurrences',
    'nav.periods':       'Periods',
    'nav.assessments':   'Assessments',
    'nav.grades':        'Grades',
    'nav.schedule':      'Schedule',
    'nav.lesson':        'Lesson',
    'nav.data':          'Data',
    'nav.collaborators': 'Collaborators',

    'action.logout':     'Log out ↩',
    'action.save':       'Save',
    'action.cancel':     'Cancel',
    'action.delete':     'Delete',
    'action.edit':       'Edit',
    'action.add':        'Add',
    'action.search':     'Search',
    'action.filter':     'Filter',
    'action.export':     'Export',
    'action.close':      'Close',

    'status.loading':    'Loading…',
    'status.error':      'Failed to load data.',
    'status.empty':      'No records found.',
    'status.offline':    'No connection',
    'status.syncing':    'Syncing…',
    'status.saved':      'Saved successfully!',
    'status.denied':     '🚫 Admin access only.',

    'auth.email':        'Email',
    'auth.password':     'Password',
    'auth.login':        'Sign in',
    'auth.logout_msg':   'Logged out.',
  },

  es: {
    'nav.dashboard':     'Panel',
    'nav.contracts':     'Contratos',
    'nav.invoices':      'Facturas',
    'nav.plans':         'Planes',
    'nav.negotiations':  'Negociaciones',
    'nav.gateways':      'Pasarelas',
    'nav.subscription':  'Suscripción',
    'nav.students':      'Alumnos',
    'nav.enrollments':   'Matrículas',
    'nav.transfers':     'Transferencias',
    'nav.reports':       'Boletines',
    'nav.history':       'Historial Académico',
    'nav.attendance':    'Asistencia',
    'nav.diary':         'Diario',
    'nav.occurrences':   'Incidencias',
    'nav.periods':       'Períodos',
    'nav.assessments':   'Evaluaciones',
    'nav.grades':        'Calificaciones',
    'nav.schedule':      'Horario',
    'nav.lesson':        'Clase',
    'nav.data':          'Datos',
    'nav.collaborators': 'Colaboradores',

    'action.logout':     'Salir ↩',
    'action.save':       'Guardar',
    'action.cancel':     'Cancelar',
    'action.delete':     'Eliminar',
    'action.edit':       'Editar',
    'action.add':        'Agregar',
    'action.search':     'Buscar',
    'action.filter':     'Filtrar',
    'action.export':     'Exportar',
    'action.close':      'Cerrar',

    'status.loading':    'Cargando…',
    'status.error':      'Error al cargar datos.',
    'status.empty':      'No se encontraron registros.',
    'status.offline':    'Sin conexión',
    'status.syncing':    'Sincronizando…',
    'status.saved':      '¡Guardado con éxito!',
    'status.denied':     '🚫 Acceso restringido a administradores.',

    'auth.email':        'Correo electrónico',
    'auth.password':     'Contraseña',
    'auth.login':        'Iniciar sesión',
    'auth.logout_msg':   'Sesión cerrada.',
  }
};

// ── Estado ────────────────────────────────────────────────────────────────────

let currentLocale = 'pt-BR';

/** Detecta idioma do navegador na inicialização */
function detectLocale() {
  const lang = navigator.language || navigator.languages?.[0] || 'pt-BR';
  if (lang.startsWith('es')) return 'es';
  if (lang.startsWith('en')) return 'en';
  return 'pt-BR';
}

// Auto-detecção
currentLocale = detectLocale();

// ── API Pública ───────────────────────────────────────────────────────────────

/**
 * Traduz uma chave para o idioma atual.
 * @param {string} key - Chave no formato 'grupo.nome' (ex: 'nav.dashboard')
 * @param {string} [fallback] - Texto fallback se a chave não existir
 * @returns {string}
 */
export function t(key, fallback) {
  const dict = dictionaries[currentLocale] || dictionaries['pt-BR'];
  return dict[key] || dictionaries['pt-BR'][key] || fallback || key;
}

/**
 * Altera o idioma ativo manualmente.
 * @param {'pt-BR' | 'en' | 'es'} locale
 */
export function setLocale(locale) {
  if (dictionaries[locale]) {
    currentLocale = locale;
    localStorage.setItem('axom_locale', locale);
  }
}

/**
 * Retorna o idioma ativo.
 * @returns {string}
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Retorna a lista de idiomas disponíveis.
 * @returns {Array<{code: string, label: string}>}
 */
export function getAvailableLocales() {
  return [
    { code: 'pt-BR', label: 'Português (BR)' },
    { code: 'en',    label: 'English' },
    { code: 'es',    label: 'Español' },
  ];
}

// Restaura preferência salva
const saved = localStorage.getItem('axom_locale');
if (saved && dictionaries[saved]) currentLocale = saved;
