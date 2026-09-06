# BYTE Forms

BYTE member profile collection app with an anonymous member draft flow, PostgreSQL persistence, image uploads, and a protected admin review dashboard.

## Local development

Requirements: Node 20+, Docker, and Docker Compose.

### Full stack (recommended)

```bash
cp .env.example .env
# Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.
docker compose up --build
```

Open <http://localhost:8083>.

The web container serves the Vite build and proxies `/api/*` and `/uploads/*` to the API. PostgreSQL data and uploaded images are stored in Docker volumes.

### Split development

Start PostgreSQL with Docker, then run the API and Vite separately:

```bash
docker compose up -d postgres
npm install
npm run api        # API on http://localhost:3001
npm run dev        # Vite on http://localhost:5173
```

Vite proxies API and upload requests to port 3001. Set `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the environment before starting the API.

## Admin access

Admin access is separate from the anonymous member form. Set credentials through environment variables; no default production credentials should be used.

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='use-a-long-random-password' npm run api
```

Then select **Admin access** in the top-right corner. The API creates the first configured admin on startup. Admin sessions use an HTTP-only cookie and can view submitted profiles, search the directory, change statuses, inspect submission data, and export CSV.

## Current API surface

- `GET /api/health` — process health check
- `GET /api/ready` — PostgreSQL readiness check
- `POST /api/submissions` — create an anonymous draft and one-time edit token
- `GET/PATCH /api/submissions/:id` — restore or autosave a draft with `x-edit-token`
- `POST /api/submissions/:id/assets` — upload a profile/project image with `x-edit-token`
- `POST /api/submissions/:id/submit` — validate and submit a draft
- `POST /api/admin/auth/login` — authenticate an administrator
- `POST /api/admin/auth/logout` — revoke the current session
- `GET /api/admin/auth/me` — restore an administrator session
- `GET /api/admin/stats` — dashboard statistics
- `GET /api/admin/submissions` — searchable/filterable submission list
- `GET /api/admin/submissions/:id` — submission detail and assets
- `PATCH /api/admin/submissions/:id/status` — update review status
- `GET /api/admin/export.csv` — authenticated CSV export

## Data and security notes

- Member forms do not require normal-member accounts or login.
- Member edit tokens are hashed in PostgreSQL and kept in browser storage so members can reopen and edit their profile until it is archived.
- Normalized member names and enrollment numbers are unique, so one member cannot create duplicate profiles.
- Admin passwords are bcrypt-hashed and admin sessions are server-side, revocable, and stored in HTTP-only cookies.
- Do not use the Docker Compose fallback admin password in production. Provide `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` through deployment secrets.
- Uploaded files are stored in the `uploads_data` volume locally. Configure an object-storage adapter before production deployment.
- The implementation is the first vertical slice of the detailed plan in `todo.md`; remaining hardening, migrations, richer validation, and comprehensive automated tests are still listed there.

## Verification

```bash
npm run build
node --check server/index.mjs
node --check server/seed-admin.mjs
docker compose config
```
