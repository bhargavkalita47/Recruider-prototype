# Recruider — full-stack app

A Node.js + SQLite implementation of the supplied `version one(1).html` prototype. The original CSS and screen templates are retained. Each data-changing action now goes through a permission-checked API and persists to disk.

## Quick start on Windows

1. Install **Node.js 24.14 or newer** (Node 24 LTS). No Python, database server, API keys, or npm dependencies are needed to run the app.
2. Extract this ZIP.
3. Open the `recruider` folder and double-click **start-demo.bat**.
4. Open **http://localhost:3000** in your browser. Keep the terminal open.

Or open a terminal in the folder:

```sh
npm run demo
```

This runs the original quick-login experience with the same sample candidates, recruiters, jobs, challenges, and badges. Demo data persists in `data/demo.sqlite`. Demo mode is limited to localhost and uses an independent database. Use it only with sample information: anyone with access to this local demo can switch between demo accounts.

To test matching, log in as Aisha, show interest in Meridian Labs' Backend Engineer job, switch to Kabir, show interest in Aisha, and choose that same job. Both accounts can now chat. For two simultaneous accounts, use different browser profiles or a normal and private window; tabs in the same profile share a login.

## Run with real accounts

```sh
npm start
```

Or double-click **start.bat** on Windows. This uses `data/recruider.sqlite`, without sample people, jobs, or matches. The badge catalog and three platform challenges are preloaded. Candidates and recruiters register with email and a password of at least 10 characters. Passwords are hashed with salted scrypt; login cookies are HttpOnly and sessions persist across server restarts.

The login screen uses the original components and theme with email/password fields replacing the demo account picker. The rest of the interface retains the prototype layout. There is no public admin registration or unprotected admin entry in this mode.

### Create an admin account (PowerShell)

Run from the app folder, choosing your own email and strong password:

```powershell
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = Read-Host "Choose admin password" -MaskInput
npm.cmd run admin
Remove-Item Env:ADMIN_PASSWORD
Remove-Item Env:ADMIN_EMAIL
```

`-MaskInput` requires PowerShell 7. In older Windows PowerShell use:

```powershell
$env:ADMIN_EMAIL = "you@example.com"
$adminSecret = Read-Host "Choose admin password" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
npm.cmd run admin
Remove-Item Env:ADMIN_PASSWORD
Remove-Item Env:ADMIN_EMAIL
Remove-Variable adminSecret
```

On macOS/Linux:

```sh
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password: ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
npm run admin
unset ADMIN_EMAIL ADMIN_PASSWORD
```

The command creates an admin or resets the password for an existing admin email, invalidating that admin's prior sessions. It refuses to promote an existing non-admin account. Then use **Enter admin** on the landing page to log in.

## Preserved features

| Area | Working functionality |
| --- | --- |
| Candidate access | Signup/login, account switching and persistent sessions |
| Job discovery | Swipe cards and drag gestures, pass/interest, job details, title/company/sector search |
| Companies | Company list and company-specific jobs |
| Candidate profiles | Editable name, sector, skills and portfolio paragraph; badges, submissions and interested recruiters |
| Recruiter discovery | Swipe candidates, search names/sectors/skills, profile and portfolio modals |
| Recruiter interest | Choose one of your own jobs before expressing interest; mutual matches |
| Recruiter content | Post jobs and custom challenges; edit contact name, company name and description; view jobs by sector |
| Challenges | Browse open challenges, submit written work once, see submitted/reviewed status |
| Admin | Dashboard counts, pending/recent submissions, challenge creation/search/filter/archive/restore/deletion |
| Reviews and badges | Mark/unmark reviewed, award catalog badges without duplicates, badge-holder view |
| Data view | Admin tables for candidates, recruiters, jobs, challenges, submissions and matches |
| Chat | Participant-only messages after mutual interest, persistent history, automatic updates approximately every two seconds |

The original behavior of one recruiter decision/selected position per candidate is retained. Matches already created remain available if later swipe decisions change. Existing challenges remain open across sectors as in the supplied HTML. The card percentages retain the prototype's deterministic demonstration scores; they are **not AI or validated compatibility ratings**.

This implements the features present in the uploaded file. Payment processing, AI summaries, email verification, password-reset emails, attachments, and notifications outside the app were not present in that file and are not added here. Submission portfolios remain text-based.

## Architecture

- `public/index.html`: original document shell, CSS, font links and responsive rules.
- `public/app.js`: original screen renderers, navigation, modals and drag interaction.
- `public/api.js`: API actions, login forms, safe text rendering and background synchronization.
- `server.mjs`: same-origin HTTP server, authentication, role checks, validation and SQLite queries.
- `seed.json`: exact sample content extracted from the prototype, used for demo setup.
- `test/api.test.mjs`: automated API workflow/security/persistence tests using Node's test runner.
- `backup.mjs`: consistent SQLite online backup utility.

Database tables: users, jobs, challenges, submissions, badges, awards, candidate_swipes, recruiter_swipes, matches, messages, sessions and meta. Foreign keys, unique constraints and write transactions enforce relationships and prevent duplicate matches/submissions/badge awards. The browser never writes a database snapshot back to the server. Role, identity, match creation and review/badge authority are enforced server-side.

Profiles and submissions are intended as discoverable portfolio content for authenticated recruiters. Email addresses are limited to their owner and admins. Candidates receive their own submissions/decisions; recruiters receive their own swipe decisions. Private chat is limited to match participants; admins can inspect chat in the platform data layer.

## Configuration and hosting

Copy `.env.example` to `.env` if configuration is needed. `npm start` and `start.bat` load it automatically. `npm run demo` deliberately does not load `.env`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` for normal-mode network access |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/recruider.sqlite` | Persistent database location; demo defaults to `data/demo.sqlite` |
| `COOKIE_SECURE` | `false` | Set `true` when serving the browser over HTTPS |
| `PUBLIC_ORIGIN` | Derived from request host | Set the exact HTTPS origin behind a reverse proxy, with no trailing slash |

For another device on your Wi-Fi: set `HOST=0.0.0.0` in `.env`, start normal mode, allow the port through your OS firewall, and open `http://YOUR-COMPUTER-LAN-IP:3000`. Use separate accounts.

For public hosting, run one Node process with a persistent writable disk and HTTPS reverse proxy. Set `COOKIE_SECURE=true` and `PUBLIC_ORIGIN=https://your-domain.example`. Keep the database out of the public directory. This is a small-deployment architecture: state refresh currently retrieves the role-filtered dataset, so high-volume use needs pagination and incremental synchronization. Request throttling is in memory, per network address; reverse proxies may make users share that address. Configure edge limits appropriately.

Optional Docker:

```sh
docker build -t recruider .
docker run --name recruider -p 3000:3000 -v recruider-data:/app/data recruider
```

The image runs as a non-root user. It uses normal mode and a persistent named volume. Provision the admin using `server.mjs --create-admin` with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set in a one-off container on the same volume. Docker setup is supplied but not executed in this workspace.

## Backups

```sh
npm run backup
```

This saves a consistent snapshot under `backups/`, including live WAL data. For another database or output filename, set `DATABASE_PATH` or run `node backup.mjs /path/to/backup.sqlite`. For a demo backup, set `DATABASE_PATH` to `data/demo.sqlite`. To restore, stop the server and point `DATABASE_PATH` at a restored copy in a fresh directory. Backups include personal data and password hashes; keep them private.

## Tests

```sh
npm test
```

The tests start isolated demo and normal servers on temporary ports/databases, then clean up. They cover signup/login/logout, admin provisioning, role/ownership checks, CSRF/origin checks, validation, job/challenge creation, duplicate prevention, review/badges, matching/chat privacy and persistence across restarts.

Fonts are loaded from the same Google Fonts links as the prototype. If those URLs are blocked, both the original and this app use their fallback fonts. No external JavaScript is loaded. The source is delivered as a runnable app; no public deployment has been created.

### Optional browser tests

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node test/browser.cjs
```

These optional development tools are not required to run Recruider. The test starts its own temporary servers and compares the supplied original with the full-stack app. `CHROMIUM_PATH` can select an existing Chromium executable. See `VALIDATION.md` for the checks performed on this delivery.

Implementation reference: [Node.js SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).
