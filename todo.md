# BYTE Forms — End-to-End Implementation TODO

> Every task starts unchecked. Check an item only after its implementation and acceptance criteria have been verified.

## 1. Confirm product rules and submission lifecycle

- [x] Confirm that normal members can open and submit the form without creating an account or signing in.
- [x] Decide how an anonymous member can resume an unfinished draft. Recommended approach: create an opaque draft edit token, store it in the member's browser, and require it for every draft read/update request.
- [x] Submitted profiles remain editable with the same member edit token until an admin archives them.
- [x] Define submission statuses and allowed transitions. Recommended statuses: `draft`, `submitted`, `in_review`, `changes_requested`, `approved`, and `archived`.
- [ ] Define which status transitions members can perform and which transitions are admin-only.
- [x] Duplicate member names and college enrollment numbers are not allowed.
- [ ] Decide whether email is required for submission confirmation or draft recovery. If it is required, add it to the basic-information requirements.
- [ ] Define data-retention rules for abandoned drafts, rejected uploads, archived submissions, admin sessions, and audit records.
- [ ] Define which member fields are visible only to admins and which may eventually be published in a public directory.
- [ ] Document the agreed rules in `README.md` before implementing persistence and authorization.

## 2. Select and scaffold the backend architecture

- [x] Add a Node.js API service to the repository. Use a maintained HTTP framework such as Fastify or Express and keep it separate from the Vite frontend entry point.
- [ ] Add a PostgreSQL data-access layer and migration system. Choose one ORM/query builder, such as Prisma, Drizzle, or Knex, and commit its schema and migrations.
- [ ] Create backend directories for configuration, database access, routes, request schemas, authentication, authorization, uploads, services, and tests.
- [x] Add separate development scripts for the frontend, API, database migrations, database seeding, and combined local development.
- [ ] Add typed environment-variable validation that fails at startup when required configuration is missing.
- [x] Create `.env.example` with non-secret placeholders for database, session, CORS, upload storage, and initial-admin configuration.
- [x] Ensure `.env`, uploaded files, session secrets, and generated credentials are excluded by `.gitignore`.
- [x] Add `/api/health` and `/api/ready` endpoints. Health should confirm that the process is running; readiness should also verify the PostgreSQL connection.
- [x] Add centralized API error handling with a consistent JSON error format containing an error code, user-safe message, and optional field-level validation errors.

## 3. Design and migrate the PostgreSQL schema

- [ ] Create an `admin_users` table with UUID, unique normalized email, password hash, active flag, created timestamp, updated timestamp, and last-login timestamp.
- [ ] Create an `admin_sessions` table if sessions are stored server-side. Include a hashed session token, admin ID, expiry, creation time, last-seen time, IP metadata, and revocation time.
- [x] Create a `submissions` table with UUID, public reference number, status, hashed member edit token, submitted timestamp, reviewed timestamp, reviewer ID, created timestamp, and updated timestamp.
- [ ] Add basic member fields to `submissions`: full name, enrollment number, current year, department/branch, BYTE roles, GitHub username, LinkedIn URL, X/Twitter handle, personal website, and quick highlights.
- [ ] Add an email field if email is selected for confirmations or draft recovery.
- [x] Add partial unique indexes for normalized member names and enrollment numbers.
- [ ] Create an `assets` table for profile photos and project cover images. Store submission ID, asset type, storage key, original filename, MIME type, byte size, image dimensions, checksum, and timestamps.
- [ ] Create a `projects` table with submission ID, stable sort order, title, description, contributors, primary URL, and optional cover asset ID.
- [ ] Create a `project_links` table with project ID, stable sort order, label, and URL.
- [ ] Create an `experiences` table with submission ID, stable sort order, role title, organization, experience type, domain tag, start date, end date, present flag, and description.
- [ ] Create an `achievements` table with submission ID, stable sort order, achievement type, event/award name, result, prize, publication/venue, date, and URL.
- [ ] Add database constraints so hackathon-only and research-only fields cannot contain contradictory data where practical.
- [ ] Create a `writing_entries` table with submission ID, stable sort order, title, URL, publish date, format, and one-line description.
- [x] Create an `admin_notes` table for private review notes linked to a submission and admin user.
- [x] Create an `audit_logs` table for admin logins, exports, status changes, edits, deletes, and other sensitive actions.
- [ ] Add indexes for status, normalized enrollment number, created time, submitted time, reviewer, and searchable member fields.
- [x] Add foreign-key delete behavior deliberately: deleting a draft should remove its child records and asset references, while deleting an admin must not erase historical audit data.
- [ ] Create and run the initial migration against the local PostgreSQL container.
- [ ] Add a migration test that creates a clean database and applies every migration successfully.

## 4. Implement secure admin authentication

- [x] Add a database seed command that creates the first admin from environment variables or an interactive command; do not commit a default password.
- [x] Hash admin passwords with Argon2id or bcrypt using an appropriate cost factor.
- [x] Implement `POST /api/admin/auth/login` with email/password validation and a generic invalid-credentials response.
- [x] Implement admin sessions using secure, HTTP-only, same-site cookies. Set `Secure` in production and rotate the session identifier after login.
- [x] Implement `POST /api/admin/auth/logout` and revoke the current server-side session.
- [x] Implement `GET /api/admin/auth/me` so the frontend can restore authenticated admin state after refresh.
- [x] Add authorization middleware to every `/api/admin/*` endpoint except login.
- [ ] Add login rate limiting by IP and normalized email.
- [ ] Add temporary lockout or progressive delays after repeated failed login attempts.
- [ ] Add CSRF protection for cookie-authenticated state-changing admin requests.
- [x] Prevent open redirects and never place session tokens in query strings or browser storage.
- [x] Record successful logins, failed logins, logout, session revocation, and password changes in the audit log.
- [x] Replace the current frontend behavior that accepts any credentials with calls to the real authentication endpoints.
- [x] Display invalid credentials, rate-limit errors, network errors, and expired-session messages without exposing sensitive backend details.
- [ ] Redirect unauthenticated users away from the admin dashboard and back to the admin login dialog/page.
- [ ] Add a secure admin password-change flow requiring the current password.
- [ ] Decide and implement a password-reset process. If email delivery is not available, document a secure operator CLI reset command.

## 5. Implement anonymous member draft creation and recovery

- [x] Implement `POST /api/submissions` to create an empty draft and return its submission UUID plus a high-entropy edit token exactly once.
- [x] Hash the edit token before storing it in PostgreSQL; never store the raw token in the database or application logs.
- [x] Store the raw edit token and draft ID in browser storage only after draft creation succeeds.
- [x] Implement `GET /api/submissions/:id` with edit-token authorization so a member can reload only their own draft.
- [ ] Implement `PATCH /api/submissions/:id` with edit-token authorization and server-side validation.
- [x] Reject member edits when the submission status does not permit them.
- [ ] Add a “Start over” action that confirms intent, deletes or abandons the current draft according to retention rules, and creates a new one.
- [ ] If email recovery is required, implement a time-limited, single-use recovery link without exposing the permanent edit token.
- [ ] Ensure enumeration protection: an invalid submission ID and an invalid edit token should produce indistinguishable authorization responses.
- [x] Ensure member edit tokens are never sent to analytics, error-report URLs, referrers, or visible query strings.

## 6. Implement member submission APIs

- [ ] Define shared request/response schemas for basic information, projects, links, experiences, achievements, writing entries, assets, and final submission.
- [ ] Implement server-side normalization for enrollment numbers, email addresses, usernames, URLs, whitespace, and empty optional values.
- [ ] Implement atomic draft updates so child collections can be created, reordered, updated, and removed without leaving orphan records.
- [ ] Use stable UUIDs for projects, links, experiences, achievements, and writing entries rather than array indexes.
- [x] Implement `POST /api/submissions/:id/submit` with edit-token authorization.
- [ ] On final submission, validate all required fields and all nested records in one server-side validation pass.
- [ ] Return field paths such as `projects.1.title` or `achievements.0.date` for validation errors so the frontend can navigate to the exact invalid field.
- [ ] Perform final submission and status change in a database transaction.
- [x] Generate and return a non-sensitive submission reference number after successful submission.
- [ ] Make final submission idempotent so repeated requests caused by retries do not create duplicate records.
- [ ] Add an API endpoint for a member to check the status of their submission using the edit token, if status visibility is part of the product rules.
- [ ] Add request body size limits and reject unknown fields.

## 7. Implement real file uploads

- [x] Choose upload storage: an S3-compatible object store for production and either MinIO or a documented local storage adapter for development.
- [ ] Add storage configuration to `.env.example` and Docker Compose if MinIO is used locally.
- [x] Implement profile-photo upload and project-cover upload endpoints authorized by the member edit token.
- [ ] Accept only explicitly supported image MIME types and verify file signatures instead of trusting the browser-provided extension or MIME type.
- [ ] Enforce maximum file size, maximum dimensions, minimum dimensions, and image count limits on the server.
- [ ] Strip image metadata where possible and generate safe server-controlled object keys.
- [ ] Generate normalized display variants or thumbnails so the admin dashboard does not load full-size originals unnecessarily.
- [ ] Calculate and store checksums to detect duplicate or corrupted uploads.
- [x] Return an asset ID and preview URL after a successful upload.
- [ ] Implement deletion/replacement of profile photos and project covers, including removal of abandoned stored objects.
- [x] Ensure a member cannot attach an asset owned by another submission.
- [ ] Add a scheduled cleanup process for unattached or abandoned draft assets.
- [ ] Add upload progress, preview, replace, remove, invalid-file, and upload-failure states to the frontend.
- [x] Make the existing profile-photo picker functional; it currently has visual controls but no file input behavior.
- [ ] Upgrade the project image picker to support both click-to-browse and actual drag-and-drop behavior, or change its copy if drag-and-drop will not be supported.

## 8. Convert the member form into a persistent controlled form

- [x] Replace uncontrolled `defaultValue` inputs with controlled form state or a form library so values can be validated, autosaved, restored, and submitted reliably.
- [ ] Define a single typed frontend model that matches the API schema.
- [x] Load an existing draft from the API when a valid draft ID/edit token exists in browser storage.
- [x] Create a new draft only when no recoverable local draft exists.
- [x] Preserve field values when moving between Basic Info, Projects, Experience, Achievements, and Writing sections.
- [x] Debounce autosave requests and save only after data changes.
- [ ] Replace the hard-coded “Autosaved just now” text with real states: `Unsaved changes`, `Saving…`, `Saved`, `Offline`, and `Save failed`.
- [ ] Retry transient autosave failures with bounded exponential backoff and retain unsaved form state in the browser.
- [ ] Warn the member before leaving or refreshing when unsaved changes remain.
- [ ] Prevent stale autosaves from overwriting newer data by using a revision number, updated timestamp, or optimistic concurrency token.
- [ ] Calculate profile completion from real required fields and sections instead of displaying a hard-coded percentage.
- [ ] Update the sidebar completion indicator after local edits and after draft restoration.
- [ ] Use stable IDs for repeated items so deleting one project, link, experience, or achievement does not move another item's state unexpectedly.
- [ ] Add functional remove controls for added project links, not only an add control.
- [ ] Add functional add/remove behavior for writing entries so the Writing section is consistent with other repeatable sections.
- [ ] Add accessible labels, button types, focus behavior, and keyboard interaction to every form control.
- [ ] On mobile, move focus to the selected section heading after sidebar navigation.

## 9. Complete member-side validation and submission UX

- [ ] Define exact required fields, minimum/maximum lengths, allowed characters, and collection limits for every section.
- [ ] Validate enrollment number format according to the college's actual format.
- [ ] Validate and normalize all URLs while allowing members to omit the scheme only if the application safely adds it.
- [ ] Validate date relationships, including start date before end date and no impossible future dates where applicable.
- [ ] Require an end date or explicit “Present” selection for work experience.
- [ ] Validate achievement fields conditionally based on the selected achievement type.
- [ ] Validate selected dropdown options server-side; never trust arbitrary client values.
- [ ] Show inline field errors and a section-level error summary.
- [ ] When final submission fails validation, navigate to and focus the first invalid field.
- [ ] Disable duplicate final submission clicks while a request is pending.
- [ ] Show a confirmation dialog explaining that final submission may lock editing.
- [ ] Replace the current `alert('Profile submitted!')` with a dedicated success screen containing the submission reference number and next steps.
- [ ] Handle server errors without losing entered data.
- [ ] Handle offline state explicitly and prevent the UI from claiming a server save succeeded while offline.
- [ ] Add a privacy notice and required consent checkbox before final submission if required by policy.

## 10. Implement admin submission management APIs

- [x] Implement `GET /api/admin/submissions` with pagination, status filtering, text search, year filtering, department filtering, reviewer filtering, and sort order.
- [ ] Search normalized name, enrollment number, department, GitHub username, and other approved searchable fields.
- [x] Implement `GET /api/admin/submissions/:id` returning the complete submission, nested records, asset URLs, review metadata, and audit history permitted for admins.
- [x] Implement `PATCH /api/admin/submissions/:id/status` with validation of allowed status transitions.
- [ ] Implement an endpoint for admins to add, edit, and delete private review notes.
- [ ] Implement an endpoint to request changes from a member and record the reason.
- [ ] If admins may correct submissions, implement narrowly scoped admin edit endpoints and audit every changed field.
- [ ] Implement archive and restore actions; avoid irreversible hard deletion from the normal dashboard.
- [ ] If permanent deletion is required, restrict it to an explicit privileged action with confirmation and audit logging.
- [x] Implement `GET /api/admin/stats` for real member, completion, project, achievement, and review counts.
- [x] Implement `GET /api/admin/activity` using real audit/submission events with pagination.
- [x] Implement CSV export with explicit columns, proper escaping, UTF-8 output, authorization, and audit logging.
- [ ] Protect CSV exports against spreadsheet formula injection by escaping cells that begin with `=`, `+`, `-`, or `@`.
- [ ] Add API pagination limits so admins cannot accidentally request the entire database in one response.

## 11. Connect the admin dashboard to real data

- [x] Restore the authenticated admin session when the app loads by calling `/api/admin/auth/me`.
- [ ] Replace all hard-coded zero statistics with values from `/api/admin/stats`.
- [x] Replace the empty member directory with paginated data from `/api/admin/submissions`.
- [x] Connect search and filter controls to real API query parameters with debouncing.
- [ ] Add loading skeletons, empty states, error states, and retry controls for stats, directory, activity, and submission details.
- [ ] Add pagination controls that retain active filters and search terms.
- [ ] Create a submission detail page or drawer that displays all member sections and uploaded images.
- [ ] Add clear status controls for Submitted, In review, Changes requested, Approved, and Archived.
- [ ] Add private admin notes to the submission detail view.
- [ ] Add a confirmation step for status changes, archive, restore, and other sensitive actions.
- [x] Connect “Export directory” to the real authenticated CSV export endpoint and download the returned file.
- [ ] Connect recent activity to `/api/admin/activity` or remove the panel until real activity exists.
- [ ] Remove or implement nonfunctional notification buttons so the admin interface contains no dead controls.
- [ ] Display session-expired errors by returning the admin to the login flow without exposing stale dashboard data.
- [ ] Ensure member edit tokens, password hashes, internal storage keys, and other secrets never appear in admin API responses.

## 12. Add optional member/admin notifications if required

- [ ] Decide whether members receive email confirmation after final submission.
- [ ] Decide whether members receive email when changes are requested, a submission is approved, or a draft recovery link is requested.
- [ ] Decide whether admins receive notifications for new submissions.
- [ ] Select an email provider and add validated email configuration.
- [ ] Create plain-text and HTML templates for each approved notification type.
- [ ] Queue email sending outside the main request transaction so provider failures do not corrupt submission state.
- [ ] Record delivery attempts without storing unnecessary message content or secrets.
- [ ] Add retry limits and a dead-letter/error-reporting process for failed notifications.
- [ ] Remove notification icons from the UI if no notification behavior is planned.

## 13. Security and privacy hardening

- [ ] Add security headers: Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, frame restrictions, and an appropriate permissions policy.
- [ ] Configure CORS to allow only the deployed frontend origin; do not use wildcard origins with credentials.
- [ ] Configure trusted proxy behavior correctly before relying on forwarded IP or HTTPS headers.
- [ ] Add rate limits for draft creation, draft reads/updates, uploads, final submission, admin login, admin search, and exports.
- [ ] Sanitize or safely render all member-provided text so stored content cannot execute as HTML or script in the admin dashboard.
- [ ] Parameterize all database access through the selected ORM/query builder.
- [ ] Prevent insecure direct object reference by authorizing every submission and asset operation against the edit token or admin session.
- [ ] Redact passwords, cookies, edit tokens, recovery tokens, database URLs, and storage credentials from logs and error reports.
- [ ] Add dependency vulnerability scanning to CI.
- [ ] Add a production secret-management plan; do not place production credentials in Docker Compose or source control.
- [ ] Add database backup, restore, encryption, and access-control requirements appropriate for member personal data.
- [ ] Test protection against brute force, CSRF, XSS, SQL injection, malicious files, oversized payloads, and CSV injection.
- [ ] Document who can access member submissions and how access is revoked when an administrator leaves the organization.

## 14. Testing

- [ ] Add unit tests for normalization, validation, status transitions, completion calculation, token hashing, and authorization helpers.
- [ ] Add API integration tests using an isolated PostgreSQL test database.
- [ ] Test admin login success, invalid credentials, lockout/rate limiting, logout, session expiry, and unauthorized admin API access.
- [ ] Test draft creation, authorized restoration, invalid edit tokens, concurrent updates, and abandoned drafts.
- [ ] Test creating, editing, reordering, and deleting every nested collection type.
- [ ] Test profile and project image upload, replacement, deletion, invalid MIME type, spoofed extension, oversized file, and unauthorized asset access.
- [ ] Test final submission validation, successful submission, duplicate retries, and post-submission edit restrictions.
- [ ] Test admin list filters, search, pagination, details, notes, status changes, archive/restore, stats, activity, and export.
- [ ] Add frontend component tests for repeated item controls, achievement type selection, native dropdown values, validation messages, and autosave states.
- [ ] Add end-to-end browser tests for the complete member flow from an empty browser through successful submission.
- [ ] Add end-to-end browser tests for admin login, locating the new submission, reviewing it, changing its status, and exporting it.
- [ ] Test keyboard-only navigation, visible focus, labels, grouped achievement controls, dialogs, and error summaries.
- [ ] Test the primary flows at mobile, tablet, and desktop viewport sizes.
- [ ] Run automated accessibility checks and manually verify critical form and admin flows with a screen reader.
- [ ] Add regression tests for refreshing mid-draft and restoring all fields, nested items, selected types, and uploaded images.

## 15. Docker, reverse proxy, and deployment

- [x] Add the API service to `docker-compose.yml` and connect it to PostgreSQL over the internal Docker network.
- [ ] Remove the database's hard-coded production-style password from committed deployment configuration; use environment injection or secrets.
- [ ] Add startup ordering/readiness logic so the API does not accept traffic before PostgreSQL and migrations are ready.
- [ ] Decide whether migrations run as a dedicated deployment job or an explicit startup step; prevent multiple replicas from racing migrations.
- [x] Configure nginx to serve the Vite frontend and reverse proxy `/api/*` to the API service.
- [x] Configure nginx upload/body-size limits to match backend upload limits.
- [ ] Add production cache headers for hashed frontend assets and no-cache rules for `index.html`.
- [ ] Add SPA fallback routing without intercepting `/api/*` errors.
- [x] Add persistent object storage configuration; do not rely on an ephemeral container filesystem for production uploads.
- [ ] Add TLS/HTTPS at the ingress or reverse proxy and verify secure cookies work in production.
- [ ] Add Docker health checks for frontend, API, PostgreSQL, and object storage where applicable.
- [x] Build and run the complete stack from a clean checkout using one documented command.
- [ ] Verify the production image contains no `.env` files, source secrets, test data, or development-only admin credentials.

## 16. Observability and operations

- [ ] Add structured request logging with request IDs and safe metadata.
- [ ] Add error tracking for frontend and backend while redacting personal data and secrets.
- [ ] Add metrics for request latency, error rate, login failures, upload failures, autosave failures, submissions by status, and email failures if email is used.
- [ ] Add alerts for API unavailability, database unavailability, repeated migration failures, high error rates, and storage exhaustion.
- [ ] Add an automated PostgreSQL backup schedule and retention policy.
- [ ] Perform and document a successful database restore test.
- [ ] Add an object-storage backup/versioning policy if uploaded images must be recoverable.
- [ ] Add a documented process for creating, disabling, and resetting admin users.
- [ ] Add a documented process for exporting, correcting, archiving, and deleting member data in response to authorized requests.

## 17. Documentation and handoff

- [ ] Update `README.md` with architecture, prerequisites, local setup, environment variables, migrations, seeding the first admin, and running tests.
- [ ] Document the exact local admin creation/login procedure without publishing a real password.
- [ ] Document the anonymous draft/edit-token behavior and its limitations, including what happens if browser storage is cleared.
- [ ] Document all API endpoints, authentication requirements, request schemas, response schemas, and error codes.
- [ ] Document supported upload formats, limits, and storage behavior.
- [ ] Document submission statuses and allowed member/admin transitions.
- [ ] Document backup/restore and production deployment steps.
- [ ] Add a privacy notice and administrator data-handling guide approved by the relevant BYTE stakeholders.

## 18. Final end-to-end acceptance checklist

- [ ] From a clean browser, a member can start a form without logging in and receives a recoverable anonymous draft.
- [ ] The member can complete every field, use native dropdowns, add/remove repeated entries, switch achievement types, and upload/replace images.
- [ ] Refreshing or closing/reopening the browser restores the draft and all successfully saved data.
- [ ] Autosave accurately reports saving, saved, offline, and failed states.
- [ ] Invalid fields block final submission and focus the member on actionable errors.
- [ ] A valid final submission is saved once, receives a reference number, and remains available after all services restart.
- [ ] An unauthenticated visitor cannot access any admin data or admin mutation endpoint.
- [ ] An administrator can log in only with valid credentials and remains authenticated across an allowed page refresh.
- [ ] The new submission appears in admin statistics, directory search, filters, recent activity, and the detail view.
- [ ] The administrator can review the full submission, view uploaded images, add a private note, and change status through valid transitions.
- [ ] CSV export contains the expected real submission data and does not permit spreadsheet formula injection.
- [ ] Logout invalidates the admin session, and the previous session cannot call protected APIs afterward.
- [ ] The complete member and admin flows pass automated tests in CI.
- [ ] The production Docker deployment passes health checks, uses HTTPS, persists database/uploads, and has a tested backup/restore procedure.
