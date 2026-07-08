import { jest } from '@jest/globals';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  describe('transformJobsForSOLR', () => {
    it('should filter locations to only Romanian cities', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: ['România'] },
          { url: 'https://test.com/2', title: 'Job 2', location: ['Bucharest'] },
          { url: 'https://test.com/3', title: 'Job 3', location: ['Bulgaria'] },
          { url: 'https://test.com/4', title: 'Job 4', location: ['Cluj-Napoca'] },
          { url: 'https://test.com/5', title: 'Job 5', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['România']);
      expect(result.jobs[1].location).toEqual(['Bucharest']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[4].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'westcompany.ro',
        company: 'west co impex srl',
        cif: '4565806',
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', company: 'west co impex', cif: '4565806' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('WEST CO IMPEX SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', workmode: 'Remote' },
          { url: 'https://test.com/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://test.com/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://test.com/4', title: 'Job 4', workmode: 'hybrid' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('hybrid');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });
  });

  describe('parseJobs', () => {
    it('should extract job titles from h2/h3 elements', () => {
      const html = '<html><body><h2>Sofer Categoria C+E</h2><h3>Manager Depozit</h3></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs.length).toBe(2);
      expect(result.jobs[0].title).toBe('Sofer Categoria C+E');
      expect(result.jobs[1].title).toBe('Manager Depozit');
    });

    it('should skip titles shorter than 3 characters', () => {
      const html = '<html><body><h2>AB</h2><h2>Valid Job</h2></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs.length).toBe(1);
      expect(result.jobs[0].title).toBe('Valid Job');
    });

    it('should deduplicate job titles', () => {
      const html = '<html><body><h2>Sofer Categoria C+E</h2><h2>Sofer Categoria C+E</h2></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs.length).toBe(1);
    });

    it('should detect Crișeni/Sălaj/Zalău location from context', () => {
      const html = '<html><body><section><h2>Sofer</h2><p>Location: Zalău</p></section></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs.length).toBe(1);
      expect(result.jobs[0].location).toEqual(['Zalău']);
    });

    it('should default to Crișeni, Sălaj when Crișeni mentioned in section', () => {
      const html = '<html><body><section><h2>Lucrator Depozit</h2><p>Job in Crișeni, Salaj</p></section></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs.length).toBe(1);
      expect(result.jobs[0].location).toEqual(['Crișeni, Sălaj']);
    });

    it('should set workmode on-site for Full Time jobs', () => {
      const html = '<html><body><section><h2>Sofer</h2><p>Full Time</p></section></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs[0].workmode).toBe('on-site');
    });

    it('should generate job URL from title', () => {
      const html = '<html><body><h2>Sofer Categoria C+E</h2></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs[0].url).toBe('https://www.westcompany.ro/cariere/#sofer-categoria-c-e');
    });

    it('should return empty array for no job content', () => {
      const html = '<html><body><p>No jobs here</p></body></html>';
      const result = index.parseJobs(html);
      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return total count matching jobs length', () => {
      const html = '<html><body><h2>Job A</h2><h2>Job B</h2><h2>Job C</h2></body></html>';
      const result = index.parseJobs(html);
      expect(result.total).toBe(3);
      expect(result.total).toBe(result.jobs.length);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://www.westcompany.ro/cariere/#senior-developer',
        title: 'Senior Developer',
        location: ['Bucharest'],
        tags: ['Java', 'Spring'],
        workmode: 'hybrid'
      };

      const COMPANY_NAME = 'WEST CO IMPEX SRL';
      const COMPANY_CIF = '4565806';

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.tags).toEqual(rawJob.tags);
      expect(result.workmode).toBe(rawJob.workmode);
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://test.com/1',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '4565806');

      expect(result.location).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.workmode).toBeUndefined();
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://test.com/1' };

      const result = index.mapToJobModel(rawJob, '4565806');

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://test.com/1');
    });
  });

});
