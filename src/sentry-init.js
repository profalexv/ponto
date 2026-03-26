/**
 * sentry-init.js — Inicialização do Sentry para captura de erros em produção
 *
 * Para ativar, defina a variável VITE_SENTRY_DSN no .env do repositório
 * ou diretamente no GitHub Actions Secrets.
 *
 * Exemplo: VITE_SENTRY_DSN=https://abc123@o456.ingest.sentry.io/789
 */
import * as Sentry from "@sentry/browser";

const DSN = import.meta.env.VITE_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE, // "production" ou "development"
    tracesSampleRate: 0.2, // 20% das transações para não estourar cota
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })
    ],
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 0.5,
  });
  console.log("[Sentry] Monitoramento ativo.");
} else {
  console.log("[Sentry] DSN não configurado — monitoramento desativado.");
}
