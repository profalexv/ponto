# Ponto — Controle de Jornada de Colaboradores

> **URL:** `https://ponto.axom.app` (GitHub Pages)

Sistema **independente** de controle de jornada de trabalho.  
Pode ser contratado por **qualquer empresa** — comércio, indústria, saúde, serviços, escolas, redes, etc.

---

## Arquitetura e Regras de Desenvolvimento

```
ponto/ (frontend estático)          motor/ (API Node.js)          Supabase (PostgreSQL)
  GitHub Pages                         Fly.io — São Paulo
  ponto.axom.app  ──HTTPS──►  aula-motor.fly.dev  ──────►  rgiaryfatyvsfgqjubmh
```

### Regras invioláveis

1. **O frontend NUNCA acessa o Supabase diretamente.**  
   Toda persistência de dados passa pelo motor (`https://aula-motor.fly.dev`).  
   O frontend não conhece `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` nem nenhuma credencial de banco.

2. **O motor no Fly.io é o único ponto de contato com o banco de dados.**  
   Credenciais do Supabase ficam apenas no Fly.io (via `fly secrets set`) e nunca no código ou no `.env` de frontend.

3. **Em desenvolvimento local, somente o frontend roda localmente.**  
   Não existe "motor local" para o ponto — o frontend aponta sempre para `https://aula-motor.fly.dev`,  
   tanto em produção quanto em testes locais (`localhost:xxxx`).  
   O CORS do motor já permite `http://localhost:*` para desenvolvimento.

4. **Migrations são aplicadas via Supabase CLI, nunca pelo frontend.**  
   ```bash
   cd motor/
   supabase db push          # aplica migrações pendentes
   ```

5. **Seed de dados de teste** é executado via motor:
   ```bash
   cd motor/
   npm run seed              # cria admin@teste.com / Teste@123 + org "Empresa Teste"
   ```

---

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
| Migrations SQL | `../motor/supabase/migrations/20260315900000_ponto_security.sql` |
| Migrations SQL | `../motor/supabase/migrations/20260315910000_ponto_employee_otp.sql` |

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
  └── ponto_org_settings     ← config completa (assinatura, IP, foto, docs, logo, segurança…)
  └── ponto_admins           ← gestores com login direto (sem SSO)
  └── ponto_admin_2fa               ← config TOTP do gestor (secret cifrado + habilitado)
  └── ponto_admin_otp_codes         ← códigos OTP por e-mail do gestor (TTL 10 min, uso único)
  └── ponto_admin_trusted_devices   ← dispositivos confiáveis do gestor (skip-2FA configurável)
  └── ponto_employee_authorized_devices ← dispositivos dos colaboradores (aceite eletrônico ou scan)
  └── ponto_employee_otp_codes      ← códigos OTP do colaborador para assinar documentos/folha (TTL 10 min)

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
Qualquer empresa acessa `https://ponto.axom.app` com e-mail e senha.  
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
- **Foto do colaborador:** URL externa (Google Drive, CDN) por colaborador; captura opcional no batimento; amostragem automática (25%) no `openPunchModal` quando `photo_sample_on_punch = true`
- **Documentos legais:** geração automática de contratos, termos LGPD e outros; arquivamento de URLs com metadados permanentes
- **Períodos mensais configuráveis:** dia de corte 1–28; abertura/fechamento manual ou automático; folha arquivada no fechamento
- **Identidade visual:** `logo_url` + `org_display_name` + `logo_show_in_docs` em `ponto_org_settings`; logo no painel, documentos e kiosque

### Segurança Avançada (v2.1 — março/2026)
- **2FA do gestor:** autenticação de dois fatores por código OTP via e-mail (SMTP) e/ou TOTP (Google Authenticator, Authy etc.), configurável por organização
- **Timeout por inatividade:** sessão do painel expira após 15, 30 ou 60 minutos sem interação; reautenticação obrigatória (com 2FA se ativo)
- **Dispositivo confiável do gestor:** opção "não solicitar 2FA neste dispositivo" com validade de 1 dia, 2 dias, 1 semana, 15 dias, 1 mês ou nunca expira — armazenado em `ponto_admin_trusted_devices`
- **Autorização de dispositivos do colaborador:** cada dispositivo de batimento é cadastrado e autorizado individualmente, com aceite eletrônico ou scan PDF anexado — nunca excluível (apenas bloqueável), registrado em `ponto_employee_authorized_devices`
- **2FA do colaborador para documentos/folha:** verificação de identidade obrigatória antes de gerar documentos ou aceitar folha mensal — via PIN ou código OTP por e-mail; backend emite `emp_sign_token` JWT de 5 min

## Conformidade legal

- CLT Art. 74 §2/§4 — registros inalteráveis; retenção mínima 5 anos
- Portaria MTP 671/2021 — REP-A (sistema alternativo por software); geração AFD
- LGPD Lei 13.709/2018 — consentimento documentado para coleta de GPS

## Planos

### SaaS (hospedagem na nuvem — sem instalação)

| Plano | Preço mensal | Colaboradores incluídos | Extra/colab. |
|---|---|---|---|
| **Por Colaborador** | R$20 (1–8 cobrados) · R$16 (9–16) · R$10 (17+) | conforme contratado | — |
| **Mini** | R$ 340 | até 30 | +R$10 |
| **Pronto** | R$ 640 | até 80 | +R$10 |
| **Máximo** | R$ 980 | até 150 | +R$6 |
| **Redes** | sob consulta | ilimitado (multi-unidade) | — |

> Usuários do **aula.axom.app** têm 20% de desconto em qualquer plano SaaS.

### Auto-hospedagem

#### Add-on SUPERPONTO (+R$300/mês sobre qualquer plano)
Disponível em qualquer plano. Instalamos banco de dados e interface nos servidores do cliente (cloud privada ou servidor local). O cliente mantém controle total da infraestrutura e dos dados.  
**Recomendado para redes.** Contratação via contato direto.

#### Plano CENTER — Exclusivo para RHs e Contabilidades

| Campo | Valor |
|---|---|
| Preço base | R$ 980/mês (mesmo que o Máximo) |
| Colaboradores incluídos | até 150 |
| Extra/colaborador | +R$4,80 (20% de desconto vs. Máximo) |
| Hospedagem | Auto-hospedado (SUPERPONTO incluso) |
| Público-alvo | Departamentos de RH e Escritórios de Contabilidade |

Inclui todos os recursos do Máximo + suporte e manutenção mensal. Permite gestão de múltiplas empresas clientes. Contratação via contato direto.


### Plano Redes
Destinado a redes de empresas ou instituições que precisam gerenciar múltiplas unidades sob um único contrato.  
Cada unidade é uma `ponto_organization` com `parent_org_id` apontando para a organização-mãe.  
Cobrança e relatórios consolidados na organização-mãe. Preço negociado conforme volume.