# Ponto — Controle de Jornada de Colaboradores

> **URL:** `https://ponto.alexandre.pro.br` (GitHub Pages)

Sistema **independente** de controle de jornada de trabalho.  
Pode ser contratado por **qualquer empresa** — comércio, indústria, saúde, serviços, escolas, redes, etc.

## Situação atual

O código está implementado dentro do repositório `app`:

| Artefato | Localização (em `app`) |
|---|---|
| Módulo frontend | `src/renderer/modules/ponto/ponto.js` |
| Rotas API | `src/web/routes/ponto.routes.js` |
| Bridge de dados | `src/renderer/data/web-bridge.js` (seção Addon Ponto) |
| Migrations SQL | `../motor/supabase/migrations/20260313100000_addon_ponto.sql` |
| Migrations SQL | `../motor/supabase/migrations/20260314100000_ponto_verificacao.sql` |
| Migrations SQL | `../motor/supabase/migrations/20260314200000_ponto_standalone.sql` |
| Migrations SQL | `../motor/supabase/migrations/20260315700000_ponto_advanced_features.sql` |
| Migrations SQL | `../motor/supabase/migrations/20260315800000_ponto_logo.sql` |

## Schema de Banco (Supabase PostgreSQL)

```
ponto_organizations          ← tenant raiz (qualquer empresa)
  ├─ cnpj                    ← CNPJ (novo)
  └── ponto_employees        ← colaboradores (org_id → ponto_organizations)
        ├─ admission_date     ← data de admissão (novo)
        └── ponto_records    ← batimentos IMUTÁVEIS (org_id + employee_id)
              ├─ ip_address   ← IP capturado na marcação (novo)
              ├─ device_id    ← FK para kiosque (novo, nullable)
              └─ origin       ← 'browser' | 'kiosk' | 'api'
        └── ponto_signatures ← aceite mensal da folha (eletrônico ou scan)
        └── ponto_employee_photos    ← fotos do colaborador (URL externa)
        └── ponto_employee_documents ← documentos arquivados (URL + metadados)
  └── ponto_record_verifications ← vistos diários de supervisão
  └── ponto_monthly_periods  ← períodos com dia de corte configurável (novo)
  └── ponto_devices          ← dispositivos kiosque autorizados (novo)
  └── ponto_org_settings     ← config completa (assinatura, IP, foto, docs, logo…)
  └── ponto_admins           ← gestores com login direto (sem SSO)

Redes:
  ponto_organizations (parent_org_id = NULL)   ← organização-mãe
    └── ponto_organizations (parent_org_id = X) ← filiais/unidades
```

**Princípios do design:**
- `ponto_organizations` é o tenant raiz — representa qualquer empresa
- Campo `aula_school_id` é FK opcional para integração com AULA (NULL quando cliente independente)
- Nenhuma tabela referencia `app_schools` como FK obrigatória
- IDs de organização são UUID (sistema independente)
- Colaboradores nunca são excluídos fisicamente (soft delete via `deleted_at`)

## Acesso

### Login direto (empresas independentes)
Qualquer empresa acessa `https://ponto.alexandre.pro.br` com e-mail e senha.  
O gestor é cadastrado em `ponto_admins` com senha em bcrypt.  
JWT emitido com `{ userId, orgId, role: 'ponto_admin' }`.

### SSO via token JWT
Aceita redirecionamentos com `?token=JWT&orgId=UUID` (token emitido pelo motor com o mesmo `JWT_SECRET`).  
Nenhum novo login é solicitado. Usado pelos clientes AULA que acessam via painel da escola.

## Funcionalidades

### Core (originais)
- Registro de entrada/saída/pausa (browser ou mobile)
- Visto diário de supervisão: `pendente` | `validado` | `inconsistente` (justificativa obrigatória)
- Aceite mensal: eletrônico (colaborador no app) ou físico (impressão + scan)
- Exportação AFD (SRTE / Portaria MTP 671/2021)
- Consentimento GPS conforme LGPD Art. 7
- Retenção de histórico por 5 anos (CLT Art. 11 / Art. 74)

### Avançadas (v2.0 — março/2026)
- **Kiosque multi-funcionário:** terminal compartilhado com PIN; autorização por dispositivo; `GET /api/ponto/kiosk/info` público com logo + nome da org
- **Restrição por IP:** gravação do IP em cada marcação; whitelist configurável por organização; painel do gestor nunca bloqueado
- **Foto do colaborador:** URL externa (Google Drive, CDN) por colaborador; captura opcional no batimento
- **Documentos legais:** geração automática de contratos, termos LGPD e outros; arquivamento de URLs com metadados permanentes
- **Períodos mensais configuráveis:** dia de corte 1–28; abertura/fechamento manual ou automático; folha arquivada no fechamento
- **Identidade visual:** `logo_url` + `org_display_name` + `logo_show_in_docs` em `ponto_org_settings`; logo no painel, documentos e kiosque

## Conformidade legal

- CLT Art. 74 §2/§4 — registros inalteráveis; retenção mínima 5 anos
- Portaria MTP 671/2021 — REP-A (sistema alternativo por software); geração AFD
- LGPD Lei 13.709/2018 — consentimento documentado para coleta de GPS

## Planos

| Plano | Preço mensal | Colaboradores incluídos | Extra |
|---|---|---|---|
| **Por Colaborador** | R$20 (1–8) · R$16 (9–16) · R$10 (17+) | Conforme contratado | — |
| **Mini** | R$ 340 | até 30 | +R$10/colaborador |
| **Pronto** | R$ 640 | até 80 | +R$10/colaborador |
| **Máximo** | R$ 980 | até 150 | +R$6/colaborador |
| **Redes** | sob consulta | ilimitado (multi-unidade) | — |

Todos os planos pagos incluem kiosque, restrição por IP, fotos, documentos e períodos configuráveis.

### Plano Redes
Destinado a redes de empresas ou instituições que precisam gerenciar múltiplas unidades sob um único contrato.  
Cada unidade é uma `ponto_organization` com `parent_org_id` apontando para a organização-mãe.  
Cobrança e relatórios consolidados na organização-mãe. Preço negociado conforme volume.