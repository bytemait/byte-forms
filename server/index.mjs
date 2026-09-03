import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3001);
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://byte:byte_local_dev@localhost:5432/byte_forms' });
const app = express();
const uploadDir = process.env.UPLOAD_DIR || path.join(root, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDir, { maxAge: '1d' }));

const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const schema = `
CREATE TABLE IF NOT EXISTS admin_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
 token_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, ip text
);
CREATE TABLE IF NOT EXISTS submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_no text UNIQUE NOT NULL,
 edit_token_hash text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','in_review','changes_requested','approved','archived')),
 data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz, reviewed_at timestamptz, reviewer_id uuid REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions(status);
CREATE INDEX IF NOT EXISTS submissions_updated_idx ON submissions(updated_at DESC);
CREATE TABLE IF NOT EXISTS assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('profile','project')), storage_key text NOT NULL, original_name text NOT NULL,
 mime_type text NOT NULL, byte_size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
 admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT, body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id bigserial PRIMARY KEY, admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL, action text NOT NULL,
 submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 ip text, created_at timestamptz NOT NULL DEFAULT now()
);
`;

async function init() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(schema);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await pool.query(`INSERT INTO admin_users(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING`, [email, hash]);
  }
}

function memberToken(req) { return req.get('x-edit-token') || ''; }
async function getSubmission(req) {
  const result = await pool.query('SELECT * FROM submissions WHERE id=$1 AND edit_token_hash=$2', [req.params.id, tokenHash(memberToken(req))]);
  return result.rows[0];
}
async function requireMember(req, res, next) {
  const submission = await getSubmission(req);
  if (!submission) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Draft not found.' } });
  req.submission = submission;
  next();
}
async function requireAdmin(req, res, next) {
  const raw = req.cookies.byte_admin_session;
  if (!raw) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Admin authentication required.' } });
  const result = await pool.query(`SELECT a.id, a.email, s.id AS session_id FROM admin_sessions s JOIN admin_users a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND a.active=true`, [tokenHash(raw)]);
  if (!result.rows[0]) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Admin authentication required.' } });
  req.admin = result.rows[0];
  next();
}
async function audit(adminId, action, submissionId, req, metadata = {}) {
  await pool.query('INSERT INTO audit_logs(admin_id,action,submission_id,metadata,ip) VALUES($1,$2,$3,$4,$5)', [adminId || null, action, submissionId || null, metadata, req.ip]);
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/ready', asyncHandler(async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));

app.post('/api/submissions', asyncHandler(async (req, res) => {
  const token = newToken();
  const reference = `BYTE-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const result = await pool.query('INSERT INTO submissions(reference_no,edit_token_hash) VALUES($1,$2) RETURNING id,reference_no,status,created_at,updated_at', [reference, tokenHash(token)]);
  res.status(201).json({ submission: result.rows[0], editToken: token });
}));
app.get('/api/submissions/:id', requireMember, (req, res) => res.json({ submission: req.submission }));
app.patch('/api/submissions/:id', requireMember, asyncHandler(async (req, res) => {
  if (req.submission.status !== 'draft' && req.submission.status !== 'changes_requested') return res.status(409).json({ error: { code: 'LOCKED', message: 'This submission can no longer be edited.' } });
  if (!req.body || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) return res.status(400).json({ error: { code: 'INVALID_DATA', message: 'A data object is required.' } });
  const result = await pool.query('UPDATE submissions SET data=$1,updated_at=now() WHERE id=$2 RETURNING id,reference_no,status,data,created_at,updated_at', [req.body.data, req.submission.id]);
  res.json({ submission: result.rows[0] });
}));
app.post('/api/submissions/:id/submit', requireMember, asyncHandler(async (req, res) => {
  if (req.submission.status !== 'draft' && req.submission.status !== 'changes_requested') return res.status(409).json({ error: { code: 'ALREADY_SUBMITTED', message: 'This submission has already been submitted.' } });
  const data = req.submission.data || {};
  const required = [['fullName', 'Full name'], ['enrollmentNumber', 'College enrollment number'], ['department', 'Department / branch']];
  const missing = required.filter(([key]) => !String(data[key] || '').trim()).map(([, label]) => label);
  if (missing.length) return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Complete the required fields before submitting.', fields: missing } });
  const result = await pool.query(`UPDATE submissions SET status='submitted',submitted_at=now(),updated_at=now() WHERE id=$1 RETURNING id,reference_no,status,submitted_at`, [req.submission.id]);
  res.json({ submission: result.rows[0] });
}));

const storage = multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) });
const imageUpload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
app.post('/api/submissions/:id/assets', requireMember, imageUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: { code: 'INVALID_FILE', message: 'Upload a JPG, PNG, or WebP image under 5MB.' } });
  const kind = req.body.kind === 'project' ? 'project' : 'profile';
  const asset = await pool.query('INSERT INTO assets(submission_id,kind,storage_key,original_name,mime_type,byte_size) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind,original_name,mime_type,byte_size', [req.submission.id, kind, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]);
  res.status(201).json({ asset: { ...asset.rows[0], url: `/uploads/${req.file.filename}` } });
}));

app.post('/api/admin/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const result = await pool.query('SELECT * FROM admin_users WHERE email=$1 AND active=true', [email]);
  const valid = result.rows[0] && await bcrypt.compare(password, result.rows[0].password_hash);
  if (!valid) { await audit(null, 'admin_login_failed', null, req, { email }); return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } }); }
  const raw = newToken();
  await pool.query(`INSERT INTO admin_sessions(admin_id,token_hash,expires_at,ip) VALUES($1,$2,now()+interval '8 hours',$3)`, [result.rows[0].id, tokenHash(raw), req.ip]);
  await pool.query('UPDATE admin_users SET last_login_at=now() WHERE id=$1', [result.rows[0].id]);
  await audit(result.rows[0].id, 'admin_login', null, req);
  res.cookie('byte_admin_session', raw, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
  res.json({ admin: { id: result.rows[0].id, email: result.rows[0].email } });
}));
app.post('/api/admin/auth/logout', requireAdmin, asyncHandler(async (req, res) => { await pool.query('UPDATE admin_sessions SET revoked_at=now() WHERE id=$1', [req.admin.session_id]); await audit(req.admin.id, 'admin_logout', null, req); res.clearCookie('byte_admin_session'); res.status(204).end(); }));
app.get('/api/admin/auth/me', requireAdmin, (req, res) => res.json({ admin: { id: req.admin.id, email: req.admin.email } }));

app.get('/api/admin/stats', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='submitted' OR status='in_review' OR status='approved')::int AS submitted, count(*) FILTER (WHERE status='in_review' OR status='changes_requested')::int AS review, count(*) FILTER (WHERE status='draft')::int AS drafts FROM submissions`);
  const nested = await pool.query(`SELECT COALESCE(sum(jsonb_array_length(COALESCE(data->'projects','[]'::jsonb))),0)::int AS projects, COALESCE(sum(jsonb_array_length(COALESCE(data->'achievements','[]'::jsonb))),0)::int AS achievements FROM submissions`);
  res.json({ ...result.rows[0], ...nested.rows[0] });
}));
app.get('/api/admin/submissions', requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25))); const offset = (page - 1) * limit;
  const values = []; const clauses = [];
  if (req.query.status && ['draft','submitted','in_review','changes_requested','approved','archived'].includes(req.query.status)) { values.push(req.query.status); clauses.push(`status=$${values.length}`); }
  if (req.query.q) { values.push(`%${String(req.query.q).toLowerCase()}%`); clauses.push(`lower(COALESCE(data->>'fullName','') || ' ' || COALESCE(data->>'enrollmentNumber','') || ' ' || COALESCE(data->>'department','')) LIKE $${values.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await pool.query(`SELECT count(*)::int AS count FROM submissions ${where}`, values);
  values.push(limit, offset);
  const rows = await pool.query(`SELECT id,reference_no,status,data,created_at,updated_at,submitted_at FROM submissions ${where} ORDER BY updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  res.json({ items: rows.rows.map(row => ({ ...row, name: row.data?.fullName || 'Unnamed member', department: row.data?.department || '—', year: row.data?.currentYear || '—' })), page, limit, total: count.rows[0].count });
}));
app.get('/api/admin/submissions/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT id,reference_no,status,data,created_at,updated_at,submitted_at,reviewed_at FROM submissions WHERE id=$1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
  const notes = await pool.query('SELECT id,body,created_at,updated_at FROM admin_notes WHERE submission_id=$1 ORDER BY created_at DESC', [req.params.id]);
  const assets = await pool.query('SELECT id,kind,original_name,mime_type,byte_size,storage_key FROM assets WHERE submission_id=$1 ORDER BY created_at', [req.params.id]);
  res.json({ submission: result.rows[0], notes: notes.rows, assets: assets.rows.map(a => ({ ...a, url: `/uploads/${a.storage_key}` })) });
}));
app.patch('/api/admin/submissions/:id/status', requireAdmin, asyncHandler(async (req, res) => {
  const transitions = { draft: ['submitted'], submitted: ['in_review'], in_review: ['changes_requested', 'approved'], changes_requested: ['submitted'], approved: ['archived'], archived: [] };
  const nextStatus = req.body?.status;
  if (!Object.prototype.hasOwnProperty.call(transitions, nextStatus)) return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid submission status.' } });
  const current = await pool.query('SELECT status FROM submissions WHERE id=$1', [req.params.id]);
  if (!current.rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
  if (!transitions[current.rows[0].status].includes(nextStatus)) return res.status(409).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot move a ${current.rows[0].status} submission to ${nextStatus}.` } });
  const result = await pool.query('UPDATE submissions SET status=$1,reviewer_id=$2,reviewed_at=now(),updated_at=now() WHERE id=$3 RETURNING id,reference_no,status,reviewed_at', [nextStatus, req.admin.id, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found.' } });
  await audit(req.admin.id, 'submission_status_changed', req.params.id, req, { status: req.body.status });
  res.json({ submission: result.rows[0] });
}));
app.post('/api/admin/submissions/:id/notes', requireAdmin, asyncHandler(async (req, res) => {
  const body = String(req.body?.body || '').trim(); if (!body || body.length > 5000) return res.status(400).json({ error: { code: 'INVALID_NOTE', message: 'Note must be between 1 and 5000 characters.' } });
  const result = await pool.query('INSERT INTO admin_notes(submission_id,admin_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at,updated_at', [req.params.id, req.admin.id, body]);
  await audit(req.admin.id, 'admin_note_added', req.params.id, req); res.status(201).json({ note: result.rows[0] });
}));
app.get('/api/admin/activity', requireAdmin, asyncHandler(async (req, res) => { const result = await pool.query('SELECT id,action,submission_id,metadata,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50'); res.json({ items: result.rows }); }));
app.get('/api/admin/export.csv', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT reference_no,status,data,created_at,submitted_at FROM submissions ORDER BY created_at DESC");
  const safe = value => { const text = String(value ?? ''); return /^[-=+@]/.test(text) ? `'${text}` : text; };
  const csv = [['Reference','Status','Name','Enrollment number','Department','Year','Created','Submitted'], ...result.rows.map(r => [r.reference_no,r.status,r.data?.fullName,r.data?.enrollmentNumber,r.data?.department,r.data?.currentYear,r.created_at,r.submitted_at])].map(row => row.map(v => `"${safe(v).replaceAll('"','""')}"`).join(',')).join('\n');
  await audit(req.admin.id, 'directory_exported', null, req, { count: result.rowCount });
  res.type('text/csv').set('Content-Disposition', 'attachment; filename="byte-directory.csv"').send(csv);
}));

app.use((err, req, res, next) => { console.error(err); if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Image must be 5MB or smaller.' } }); res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }); });

init().then(() => app.listen(port, () => console.log(`BYTE API listening on :${port}`))).catch(error => { console.error(error); process.exit(1); });
