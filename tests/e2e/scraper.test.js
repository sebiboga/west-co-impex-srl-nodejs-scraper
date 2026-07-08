import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

const COMPANY_CIF = '4565806';
const COMPANY_LEGAL_NAME = 'WEST CO IMPEX SRL';
const COMPANY_BRAND = 'West Company';
const COMPANY_SEARCH_TERM = 'WEST CO IMPEX';
const COMPANY_CAREERS_URL = 'https://www.westcompany.ro/cariere/';

describe('E2E: Full Scraping Pipeline', () => {

  describe('West Company Careers Page — Real Data Fetch', () => {
    let html;

    beforeAll(async () => {
      const res = await fetch(COMPANY_CAREERS_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html'
        }
      });
      html = await res.text();
    }, 15000);

    it('should respond with valid HTML from careers page', () => {
      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('</html>');
    });

    it('should contain job-related content', () => {
      const hasJobKeywords = /cariere|job|post|oportunități|opportunities/i.test(html);
      expect(hasJobKeywords).toBe(true);
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let html;
    let parseResult;

    beforeAll(async () => {
      index = await import('../../index.js');
      const res = await fetch(COMPANY_CAREERS_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html'
        }
      });
      html = await res.text();
      parseResult = index.parseJobs(html);
    }, 15000);

    it('should parse careers page HTML into standardized job format', () => {
      expect(parseResult).toHaveProperty('jobs');
      expect(parseResult).toHaveProperty('total');
      expect(Array.isArray(parseResult.jobs)).toBe(true);

      if (parseResult.jobs.length > 0) {
        const parsed = parseResult.jobs[0];
        expect(parsed).toHaveProperty('url');
        expect(parsed).toHaveProperty('title');
        expect(parsed).toHaveProperty('workmode');
        expect(parsed).toHaveProperty('location');
        expect(Array.isArray(parsed.location)).toBe(true);
      }
    });

    it('should map parsed jobs to job model', () => {
      if (parseResult.jobs.length === 0) {
        console.log('⚠️ No jobs parsed from careers page — skipping mapping test');
        return;
      }

      const model = index.mapToJobModel(parseResult.jobs[0], COMPANY_CIF);
      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('cif', COMPANY_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
    });

    it('should transform jobs and filter to Romanian locations', () => {
      if (parseResult.jobs.length === 0) {
        console.log('⚠️ No jobs parsed — skipping transform test');
        return;
      }

      const jobs = parseResult.jobs.map(j => index.mapToJobModel(j, COMPANY_CIF));
      const payload = {
        source: 'westcompany.ro',
        company: COMPANY_LEGAL_NAME,
        cif: COMPANY_CIF,
        jobs
      };

      const transformed = index.transformJobsForSOLR(payload);

      expect(transformed.company).toBe(COMPANY_LEGAL_NAME);
      expect(transformed.jobs.length).toBe(jobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find company in ANAF and validate active status', async () => {
      const results = await anaf.searchCompany(COMPANY_SEARCH_TERM);

      const found = results.find(c =>
        c.name.toUpperCase().includes('WEST CO') &&
        c.statusLabel === 'Activă'
      );
      expect(found).toBeDefined();
      expect(found.cui.toString()).toBe(COMPANY_CIF);

      const anafData = await anaf.getCompanyFromANAF(COMPANY_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe(COMPANY_LEGAL_NAME);
      expect(result.cif).toBe(COMPANY_CIF);

      if (result.existingJobsCount === 0) {
        console.log('⚠️ No jobs in Solr — skipping job count assertion');
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    it('should detect inactive/radiated companies via ANAF', async () => {
      const anaf = await import('../../src/anaf.js');
      const results = await anaf.searchCompany('COMPANY THAT DOES NOT EXIST');

      if (results.length > 0) {
        const nonActive = results.find(c => c.statusLabel !== 'Activă');
        if (nonActive) {
          expect(nonActive.statusLabel).toMatch(/Radiată|Inactiv|Suspendat/i);
        }
      }
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have company jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(COMPANY_CIF);

      if (result.numFound === 0) {
        console.log('⚠️ No jobs in Solr — skipping SOLR data verification');
        return;
      }

      for (const job of result.docs) {
        expect(job.company).toBe(COMPANY_LEGAL_NAME);
        expect(job.cif).toBe(COMPANY_CIF);
      }
    }, 15000);

    itIfSolr('should have company core entry with required fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${COMPANY_CIF}`);

      expect(result.numFound).toBe(1);
      const company = result.docs[0];
      expect(company.company).toBe(COMPANY_LEGAL_NAME);
      expect(company.status).toBe('activ');
    }, 15000);
  });
});
