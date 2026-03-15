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

## Schema de Banco (Supabase PostgreSQL)

```
ponto_organizations          ← tenant raiz (qualquer empresa)
  └── ponto_employees        ← colaboradores (org_id → ponto_organizations)
        └── ponto_records    ← batimentos IMUTÁVEIS (org_id + employee_id)
        └── ponto_signatures ← aceite mensal da folha (eletrônico ou scan)
  └── ponto_record_verifications ← vistos diários de supervisão
  └── ponto_org_settings     ← config de métodos de assinatura aceitos
  └── ponto_admins           ← gestores com login direto (sem SSO)

Redes:
  ponto_organizations (parent_org_id = NULL)   ← organização-mãe
    └── ponto_organizations (parent_org_id = X) ← filiais/unidades
```

**Princípios do design:**
- `ponto_organizations` é o tenant raiz — representa qualquer empresa
- Campo `aula_school_id` é gerido internamente pela integração `scholar/ponto`; não exposto neste frontend
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
Nenhum novo login é solicitado. Este mecanismo é usado pela interface `scholar/ponto` do AULA.

## Funcionalidades

- Registro de entrada/saída/pausa (browser ou mobile)
- Visto diário de supervisão: `pendente` | `validado` | `inconsistente` (justificativa obrigatória)
- Aceite mensal: eletrônico (colaborador no app) ou físico (impressão + scan)
- Exportação AFD (SRTE / Portaria MTP 671/2021)
- Consentimento GPS conforme LGPD Art. 7
- Retenção de histórico por 5 anos (CLT Art. 11 / Art. 74)

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

### Plano Redes
Destinado a redes de empresas ou instituições que precisam gerenciar múltiplas unidades sob um único contrato.  
Cada unidade é uma `ponto_organization` com `parent_org_id` apontando para a organização-mãe.  
Cobrança e relatórios consolidados na organização-mãe. Preço negociado conforme volume.