# Instructions

## Project Purpose

This scraper extracts job listings for WEST CO IMPEX SRL (West Company) from the company careers page (`https://www.westcompany.ro/cariere/`) and the ANOFM API, then imports them to peviitor.ro.

## Model Schemas

The job and company models are defined in:
- `ai/job-model.md` - Job model schema
- `ai/company-model.md` - Company model schema

## Important

These models are **dynamic** and can change over time. They are based on the official Peviitor Core schemas which may be updated.

## How to Keep Models Updated

When working on this scraper:

1. **Check for updates** in the Peviitor Core repository:
   - Repository: https://github.com/peviitor-ro/peviitor_core
   - Main file: README.md (contains Job and Company model schemas)

2. **When to update**:
   - Before starting new development work
   - If field requirements or validations have changed
   - If new fields have been added

3. **How to update**:
   - Fetch the latest README.md from peviitor_core main branch
   - Compare with current ai/job-model.md and ai/company-model.md
   - Update local files if there are differences
   - Update scraper/index.js mapping logic if field requirements changed

## Technologies

- **Node.js & JavaScript** - For scraping and data extraction
- **Peviitor API** - For data storage and retrieval (api.peviitor.ro)
- **ANAF / DemoANAF** - For company validation
- **cheerio** - For HTML parsing of the careers page

## Workflow Steps

1. **Start with brand** - We know the brand ("West Company")
2. **Search in DemoANAF** - Find company by brand, get CIF from search results
3. **Get company details from ANAF** - Using CIF, fetch full company data from ANAF
4. **Validate with Peviitor** - Verify company exists in Peviitor, get group/brand info
5. **Check existing jobs** - Query Peviitor API by CIF to see what jobs already exist
6. **Check company status** - If ANAF status = "inactive" → DELETE existing jobs and STOP
7. **Save company.json** - Save all ANAF + Peviitor data for backup
8. **Scrape new jobs** - Extract jobs from the careers page + ANOFM API (by CIF)
9. **Transform for API** - Validate and fix job data:
   - location: Only Romanian cities allowed
   - tags: lowercase, no diacritics
   - company: uppercase
10. **Upsert to API** - Import/update jobs via Peviitor API
11. **Verify URLs** - Check existing job URLs still work, delete 404s

## Running the Scraper

```bash
# Run the full scraper workflow (single command)
npm run scrape
```

> **Important**: The scraper only upserts West Company + ANOFM jobs for this CIF. Existing jobs are preserved.

## Full Workflow (automatic)

When running `npm run scrape`, the following steps happen automatically:

1. **Check existing jobs count** - Query Peviitor API by CIF (read-only)
2. **Validate company via ANAF** - Check company exists and is active
3. **Scrape jobs** - Extract jobs from the careers page and ANOFM API
4. **Transform for API** - Fix locations (only Romanian cities), normalize fields
5. **Upsert to API** - Add/update jobs (API handles duplicates by URL)
6. **Delete stale jobs** - Remove jobs previously scraped but no longer present
7. **Show Summary** - Log job counts

## File Responsibilities

| File | Role |
|------|------|
| `scraper/config/company.json` | **Single source of truth** for company identity (CIF, brand, URLs, API params) |
| `scraper/config/company.js` | ESM wrapper that loads `scraper/config/company.json` for Node code |
| `scraper/config/scraper.json` | Scraper config (careers API base, list path, default location) |
| `scraper/index.js` | Main entry point - full workflow: validate company → scrape → transform → upsert → generate docs/jobs.md |
| `scraper/company.js` | Validates company via ANAF + Peviitor; caches in root `company.json` (7-day TTL) and `tmp/company.json` |
| `scraper/api.js` | Peviitor API operations module - query, delete, upsert jobs + standalone commands |
| `scraper/anaf.js` | ANAF API core module - searchCompany(brand) and getCompanyFromANAF(cif) with 3-retry/2s-backoff |
| `scraper/demoanaf.js` | CLI entry point for ANAF module (thin wrapper around scraper/anaf.js) |
| `scraper/job-validator.js` | Shared validation primitives: `validateByHead`, `validateByContent`, `DEFAULT_EXPIRED_KEYWORDS` |
| `scraper/validate-jobs.js` | Manual deep validator (content-aware); thin CLI wrapper over `scraper/job-validator.js` |
| `scraper/markdown-generator.js` | Generates `docs/jobs.md` with company info and all scraped jobs |
| `tests/validate-west-company-jobs.js` | CI fast validator (HEAD only); thin CLI over `scraper/job-validator.js` + `scraper/api.js` |
| `tests/unit/index.test.js` | Unit tests for parsePageJobs, mapToJobModel, transformJobsForSOLR |
| `tests/unit/company.test.js` | Unit tests for validateAndGetCompany and fallback caching |
| `tests/unit/api.test.js` | Unit tests for API query, upsert, delete operations |
| `tests/unit/demoanaf.test.js` | Unit tests for ANAF search and company retrieval |
| `tests/integration/workflow.test.js` | Live integration tests - ANAF + Peviitor API |
| `tests/e2e/scraper.test.js` | End-to-end tests with real careers page + ANOFM data |
| `tests/consistency/public.test.js` | Verifies repo is public on GitHub |
| `tests/consistency/repo.test.js` | Verifies branch, Pages, workflow files |
| `tests/consistency/topics.test.js` | Verifies required repo topics |
| `tests/consistency/workflow-naming.test.js` | Validates workflow naming conventions |

## API Endpoints

- **West Company careers**: `https://www.westcompany.ro/cariere/`
- **ANOFM jobs**: `https://mediere.anofm.ro/api/entity/vw_public_job_posting` (POST by `employer_tax_code`)
- **DemoANAF Search**: `https://demoanaf.ro/api/search?q=BRAND` - Search companies by name/brand
- **DemoANAF Company**: `https://demoanaf.ro/api/company/:cui` - Get company details by CIF
- **Peviitor API**: `https://api.peviitor.ro/v1/company/`

## Rate Limiting & Politeness

The scraper is intentionally slow to be a good citizen:

| Setting | Value | Where |
|---------|-------|-------|
| ANAF retries | 3 attempts, 2s exponential backoff | `scraper/anaf.js` |
| Concurrency | 1 (sequential) | No `Promise.all` for API fetches |
| User-Agent | `job_seeker_ro_spider` | Identifies the scraper in server logs |

Derived scrapers should keep these defaults unless the target source explicitly permits otherwise.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_REPOSITORY` | Used by consistency tests — format: `owner/repo` |
| `GITHUB_TOKEN` | GitHub API token for consistency tests |

`dotenv` loads `.env.local` automatically at startup — set variables there for local runs. Never commit `.env.local`.

## Standalone Commands

```bash
# Verify jobs in Peviitor API by CIF
node scraper/api.js <CIF>

# Extract existing jobs from Peviitor API by CIF
node scraper/api.js extract <CIF>

# Query company in Peviitor API
node scraper/api.js company <search_term>

# Get company details from ANAF by CIF
node scraper/demoanaf.js <CIF>

# Search companies in ANAF by brand
node scraper/demoanaf.js search <brand>
```

## Testing

This project requires multiple levels of testing:

1. **Unit Tests** - Test individual modules (api.js, company.js) in isolation
2. **Integration Tests** - Test API interactions (ANAF, Peviitor) in `tests/integration` folder
3. **E2E Tests** - Test full workflow in `tests/e2e` folder

Run tests:
```bash
npm test
```

## Temporary Files

All temporary/scratch files must be placed in `tmp/` inside the project root (never outside the project). The `tmp/` directory is in `.gitignore` and will not be committed.
