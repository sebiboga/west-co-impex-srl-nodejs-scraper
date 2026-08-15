# AGENTS.md — Rules for AI agents

## Project

West Company scraper for peviitor.ro (Node.js, ESM, Jest)

## 🌱 This Repo Is a Derived Scraper

This repo is a **derived scraper** generated from the [EPAM Systems International SRL template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper) for the peviitor.ro ecosystem.

When making changes:

- **All company-specific identity lives in `scraper/config/company.json`** (id, company, brand, URLs, API params). Read from `scraper/config/company.js` in Node code, or via `jq` in workflows. Never hardcode in source files.
- **Only the API parsing logic in `scraper/index.js`** (`fetchJobsPage`, `parsePageJobs`) is site-specific. The output shape (`mapToJobModel`, `transformJobsForSOLR`) must stay uniform across derived scrapers.
- **If you add a new file, update [CONTRIBUTING.md](CONTRIBUTING.md)** — the derivation checklist must stay accurate.

## Critical Rules

### 0. Background tasks — always pass `--repo` explicitly to `gh`

When polling a workflow run with `until [ "$(gh run view ID --json status -q .status)" = "completed" ]; do sleep N; done`, the `gh run view` command implicitly uses the current working directory's git remote. If the CWD is a different repo (e.g. you cd-ed elsewhere mid-task), `gh` looks in the wrong repo and returns 404 — the loop's check becomes `"" != "completed"` (always true) and the background task sleeps forever.

**Always specify the repo explicitly:**

```bash
gh run view <RUN_ID> --repo peviitor-scrapers/west-co-impex-srl-nodejs-scraper --json status -q .status
```

Before starting any `gh run watch` or polling loop in the background, sanity-check:

- Does the command include `--repo`?
- Is the run ID from the same repo as `--repo`?

If you spawn a stuck task, kill it immediately rather than letting it hang.

### 1. Temporary Files

All temporary/scratch files MUST go in `tmp/` inside the project root.
NEVER use paths outside the project (e.g. `C:\Users\...\AppData\Local\Temp\opencode`).

### 2. Issues & GitHub

- **Orice modificare de cod trebuie să aibă un issue în GitHub Issues** (vezi [ISSUES.md](ISSUES.md))
- Excepții: typo-uri, whitespace, documentație minoră
- Create a GitHub issue before implementing any change
- Commit messages must reference the issue they close
- Never commit credentials (`.env.local`, `*.pem`, etc.)
- Push after commit

### 3. Environment Variables

- Consistency tests need `GITHUB_REPOSITORY` (format: `owner/repo`) and `GITHUB_TOKEN`
- `.env.local` is NOT used — all operations go through the Peviitor API (no direct SOLR access)

### 4. Testing

```bash
# All tests
npm test

# Unit tests (no env vars needed)
npm run test:unit

# Integration tests (ANAF + Peviitor API)
npm run test:integration

# E2E tests (real careers page + ANOFM, ANAF/API conditional)
npm run test:e2e

# Consistency tests (GitHub repo config — needs GITHUB_REPOSITORY + GITHUB_TOKEN)
npm run test:consistency
```

### 5. ESM + Jest

- Use `jest.unstable_mockModule` (NOT `jest.mock`) for mocking ESM modules
- Run with `--experimental-vm-modules` flag

### 6. Verification

- După orice modificare, urmează [VERIFY.md](VERIFY.md) pas cu pas
- Ultimul pas = rulează scraperul prin GitHub Actions, verifică job-urile în peviitor.ro, și verifică că `docs/jobs.md` a fost generat și este accesibil pe GitHub Pages
- Toate workflow-urile din `.github/workflows/` trebuie să treacă înainte de merge

### 7. Module Structure

- `scraper/config/company.json` + `scraper/config/company.js` — single source of truth for company identity
- `scraper/anaf.js` — ANAF API core module (imported by company.js); retry logic: 3 retries, 2s delay
- `scraper/markdown-generator.js` — generates `docs/jobs.md` after each scrape; called from index.js
- `scraper/job-validator.js` — shared `validateByHead` + `validateByContent` used by both validator CLIs
- `scraper/demoanaf.js` — CLI wrapper around scraper/anaf.js
- `scraper/company.js` — company validation (ANAF + Peviitor API); root `company.json` is a 7-day ANAF cache committed to repo, with stale fallback
- `scraper/api.js` — Peviitor API operations (query, upsert, delete)
- `scraper/validate-jobs.js` — manual deep validator (content-aware); thin wrapper over scraper/job-validator.js
- `tests/validate-west-company-jobs.js` — CI fast validator (HEAD only); thin wrapper over scraper/job-validator.js + scraper/api.js
- `scraper/index.js` — main scraper orchestrator

### 8. Caching Behavior

- `tmp/company.json` — per-run scratch cache (gitignored)
- `company.json` (root) — committed cache, refreshed every 7 days (configurable via `CACHE_MAX_AGE_DAYS` in company.js)
- If ANAF is unreachable AND cache is stale, the code falls back to the stale cache rather than failing the scrape
- `docs/company.json` is regenerated on every scrape so GitHub Pages can read company identity
