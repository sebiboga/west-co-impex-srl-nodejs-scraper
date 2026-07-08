import { jest } from '@jest/globals';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

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

function mcpSearchResponse(searchData) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: '1',
      result: {
        content: [{ type: 'text', text: JSON.stringify(searchData) }],
        isError: false
      }
    })
  };
}

function mcpErrorResponse() {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: '1',
      result: {
        content: [{ type: 'text', text: 'Some error' }],
        isError: true
      }
    })
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    text: async () => 'Error'
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

const CACHED_DATA = {
  cui: "4565806",
  name: 'WEST CO IMPEX SRL',
  address: 'Sat Crişeni, Comuna Crişeni, Sălaj',
  registrationNumber: 'J1993000598312',
  caenCode: '2224 — Fabricarea articolelor din material plastic pentru construcții',
  inactive: false,
};

describe('src/anaf.js', () => {
  let anaf;

  beforeAll(async () => {
    anaf = await import('../../src/anaf.js');
  });

  beforeEach(() => {
    mockFetch.mockReset();
    anaf.setRetryDelay(100);
  });

  describe('searchCompany', () => {
    it('should return array of companies for valid brand', async () => {
      mockFetch.mockResolvedValue(mcpSearchResponse({
        query: 'WEST CO IMPEX',
        results: [
          { cui: '4565806', name: 'WEST CO IMPEX SRL', status_label: 'Activă', is_active: true }
        ]
      }));

      const results = await anaf.searchCompany('WEST CO IMPEX');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('cui');
      expect(results[0]).toHaveProperty('name');
    });

    it('should return empty array for non-existent brand', async () => {
      mockFetch.mockResolvedValue(mcpSearchResponse({ query: 'NonExistentBrandXYZ123', results: [] }));

      const results = await anaf.searchCompany('NonExistentBrandXYZ123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should include statusLabel in results', async () => {
      mockFetch.mockResolvedValue(mcpSearchResponse({
        query: 'WEST CO IMPEX',
        results: [
          { cui: '4565806', name: 'WEST CO IMPEX SRL', status_label: 'Activă', is_active: true }
        ]
      }));

      const results = await anaf.searchCompany('WEST CO IMPEX');

      expect(results[0]).toHaveProperty('statusLabel', 'Activă');
    });

    it('should throw on error response', async () => {
      mockFetch.mockResolvedValue(mcpErrorResponse());

      await expect(anaf.searchCompany('WEST CO IMPEX')).rejects.toThrow('Some error');
    });
  });

  describe('getCompanyFromANAF', () => {
    it('should return company data for valid CIF', async () => {
      mockFetch.mockResolvedValue(mcpProfileResponse(WEST_CO_PROFILE));

      const data = await anaf.getCompanyFromANAF('4565806');

      expect(data).toBeDefined();
      expect(data.cui).toBe('4565806');
      expect(data.name).toBe('WEST CO IMPEX SRL');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('registrationNumber');
    });

    it('should retry on HTTP error then succeed', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(mcpProfileResponse(WEST_CO_PROFILE));

      const data = await anaf.getCompanyFromANAF('4565806');

      expect(data).toBeDefined();
      expect(data.cui).toBe('4565806');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after exhausting retries', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAF('4565806')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle MCP API-level error response', async () => {
      mockFetch.mockResolvedValue(mcpErrorResponse());

      await expect(anaf.getCompanyFromANAF('00000000')).rejects.toThrow();
    });
  });

  describe('getCompanyFromANAFWithFallback', () => {
    it('should return fresh data when API works', async () => {
      mockFetch.mockResolvedValue(mcpProfileResponse(WEST_CO_PROFILE));

      const data = await anaf.getCompanyFromANAFWithFallback('4565806');

      expect(data.name).toBe('WEST CO IMPEX SRL');
    });

    it('should use cached data when API fails', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      const data = await anaf.getCompanyFromANAFWithFallback('4565806', CACHED_DATA);

      expect(data).toEqual(CACHED_DATA);
    });

    it('should throw when API fails and no cache available', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAFWithFallback('4565806')).rejects.toThrow();
    });
  });
});
