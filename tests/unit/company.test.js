import { jest } from '@jest/globals';
import fs from 'fs';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

const COMPANY_JSON_PATH = 'tmp/company.json';
const ROOT_COMPANY_JSON_PATH = 'company.json';

function backupFile(path) {
  if (fs.existsSync(path)) {
    fs.renameSync(path, `${path}.bak`);
  }
}

function restoreFile(path) {
  if (fs.existsSync(`${path}.bak`)) {
    fs.renameSync(`${path}.bak`, path);
  }
}

function clearAllCaches() {
  for (const p of [COMPANY_JSON_PATH, ROOT_COMPANY_JSON_PATH]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function mcpProfileResponse(profileData) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: '1',
      result: {
        content: [{ type: 'text', text: JSON.stringify(profileData) }],
        isError: false
      }
    })
  };
}

function peviitorResponse(companies) {
  return {
    ok: true,
    json: async () => ({ companies })
  };
}

function solrResponse(numFound, docs) {
  return {
    ok: true,
    json: async () => ({ response: { numFound, docs } })
  };
}

const WEST_CO_PROFILE = {
  cui: "4565806",
  name: "WEST CO IMPEX SRL",
  display_name: "WEST CO IMPEX SRL",
  location: "Sat Crişeni, Comuna Crişeni, Sălaj",
  status_label: "Activă",
  is_active: true,
  primary_caen_display: "2224 — Fabricarea articolelor din material plastic pentru construcții",
  sections: [
    {
      key: "identificare_juridica",
      fields: [
        { label: "CUI/CIF", value: "4565806" },
        { label: "Număr registru", value: "J1993000598312" },
        { label: "Adresă", value: "Nr. 1, Cod poștal 4748" }
      ]
    },
    {
      key: "rezumat_fiscal",
      fields: [
        { label: "Status TVA", value: "Plătitor TVA" }
      ]
    }
  ]
};

describe('company.js', () => {
  let company;

  beforeAll(async () => {
    process.env.SOLR_AUTH = 'test:test';
    fs.mkdirSync("tmp", { recursive: true });
    backupFile(COMPANY_JSON_PATH);
    backupFile(ROOT_COMPANY_JSON_PATH);
    company = await import('../../company.js');
  });

  afterAll(() => {
    delete process.env.SOLR_AUTH;
    restoreFile(COMPANY_JSON_PATH);
    restoreFile(ROOT_COMPANY_JSON_PATH);
  });

  beforeEach(() => {
    mockFetch.mockReset();
    clearAllCaches();
  });

  describe('getCompanyData (no cache)', () => {
    it('should fetch West Company via CIF lookup and return company data', async () => {
      mockFetch.mockResolvedValueOnce(mcpProfileResponse(WEST_CO_PROFILE));

      const result = await company.getCompanyData();

      expect(result).toHaveProperty('company', 'WEST CO IMPEX SRL');
      expect(result).toHaveProperty('cif', '4565806');
      expect(result).toHaveProperty('active', true);
      expect(result).toHaveProperty('anafData');
      expect(result.anafData.name).toBe('WEST CO IMPEX SRL');
    });

    it('should throw when company data has no name', async () => {
      const noNameProfile = { ...WEST_CO_PROFILE, name: null };
      mockFetch.mockResolvedValueOnce(mcpProfileResponse(noNameProfile));

      await expect(company.getCompanyData()).rejects.toThrow('cuifirma.ro returned no company name');
    });
  });

  describe('getCompanyData (with cache)', () => {
    const cachedData = {
      validatedAt: new Date().toISOString(),
      source: "cuifirma.ro",
      anaf: {
        name: 'WEST CO IMPEX SRL',
        cui: '4565806',
        address: 'Sat Crişeni, Comuna Crişeni, Sălaj',
        inactive: false
      },
      summary: {
        company: 'WEST CO IMPEX SRL',
        cif: '4565806',
        active: true
      }
    };

    beforeEach(() => {
      fs.writeFileSync(COMPANY_JSON_PATH, JSON.stringify(cachedData), 'utf-8');
    });

    it('should use cached company data when available', async () => {
      const result = await company.getCompanyData();

      expect(result.company).toBe('WEST CO IMPEX SRL');
      expect(result.cif).toBe('4565806');
      expect(result.active).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('validateAndGetCompany', () => {
    afterEach(() => {
      clearAllCaches();
    });

    it('should return company data with status active', async () => {
      mockFetch
        .mockResolvedValueOnce(mcpProfileResponse(WEST_CO_PROFILE))
        .mockResolvedValueOnce(solrResponse(5, [
          { url: 'https://test.com/1', title: 'Job 1' },
          { url: 'https://test.com/2', title: 'Job 2' }
        ]))
        .mockResolvedValueOnce(peviitorResponse([{ company: 'WEST CO IMPEX SRL' }]));

      const result = await company.validateAndGetCompany();

      expect(result).toHaveProperty('status', 'active');
      expect(result).toHaveProperty('company', 'WEST CO IMPEX SRL');
      expect(result).toHaveProperty('cif', '4565806');
      expect(result).toHaveProperty('existingJobsCount');
      expect(typeof result.existingJobsCount).toBe('number');
    });
  });
});
