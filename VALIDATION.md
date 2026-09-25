# Validation results

Validated on 22 September 2026 with Node.js 24.19.0 and headless Chromium 153.

## Results

- **7 API test groups passed**, covering account registration/login/logout, normal-mode admin provisioning, authorization and ownership, CSRF/origin checks, input validation, persisted profiles, company/job consistency, mutual matching, duplicate prevention, private messaging, challenges, submissions, review, badges, archive/restore/delete, and session/data persistence across restart.
- **Browser workflows passed** for quick login, password registration/login, candidate and recruiter interest, position selection, real pointer-drag swiping, two-account messaging, updates while drafting a message, character-by-character search, profile editing/reload, submission/review, job and challenge posting, company navigation with apostrophes, demo signup and hostile-text escaping.
- **23 screenshot comparisons matched byte-for-byte** between the original prototype and connected app. These cover landing/auth, candidate/recruiter/admin screens, search/company tabs, portfolio/job modals and mobile landing/candidate layouts. The source CSS also matches byte-for-byte. See `test-results/browser-report.json`.
- **Zero browser JavaScript errors** in the successful workflow run.
- **Backup utility passed** a live-WAL database-copy check.

## Test conditions and boundaries

The original and app used identical viewport/browser settings. Google Fonts requests were blocked for both during screenshot comparisons to eliminate external loading differences; the unchanged CSS and Google Fonts links remain in the delivered app. Desktop screenshots used 1440×1000 and mobile screenshots used 390×844. The 23 comparisons include two repeated home states before switching discovery tabs.

Visual comparisons cover the original demo states. Normal-mode login intentionally replaces the insecure account picker with password fields styled using the original components. Normal-mode signup/login was tested separately as a browser workflow.

The Dockerfile and Windows launchers are supplied but were not executed on Docker or Windows in this Linux environment. No public hosting deployment, large-scale load test, third-party security audit or email/payment/AI integration is claimed.

The original reference HTML is included under `reference/prototype.html`. Tests use temporary databases, not your app data. The delivered archive contains no test accounts, database files, credentials or session cookies; sample content lives in `seed.json` and is created only by demo mode.
