import fetch from "node-fetch";

const MCP_URL = "https://cuifirma.ro/mcp/cuifirma";
const MAX_RETRIES = 3;
let RETRY_DELAY_MS = 2000;

export function setRetryDelay(ms) {
  RETRY_DELAY_MS = ms;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mcpCall(tool, args) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'job_seeker_ro_spider'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'tools/call',
      params: { name: tool, arguments: args }
    })
  });

  if (!res.ok) throw new Error(`cuifirma HTTP error: ${res.status}`);

  const json = await res.json();

  if (json.error) throw new Error(`cuifirma error: ${json.error.message}`);
  if (json.result?.isError) throw new Error(json.result.content[0]?.text || 'cuifirma error');

  try {
    return JSON.parse(json.result.content[0].text);
  } catch (e) {
    throw new Error(`cuifirma parse error: ${e.message}`);
  }
}

function extractSection(sections, key) {
  return sections?.find(s => s.key === key);
}

function findFieldValue(section, label) {
  return section?.fields?.find(f => f.label === label)?.value;
}

export async function getCompanyFromANAF(cif) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const profile = await mcpCall('get-firm-profile', { cui: cif });

      const juridical = extractSection(profile.sections, 'identificare_juridica');
      const fiscal = extractSection(profile.sections, 'rezumat_fiscal');
      const vatStatus = findFieldValue(fiscal, 'Status TVA');

      return {
        name: profile.name,
        cui: profile.cui,
        address: profile.location || findFieldValue(juridical, 'Adresă') || '',
        inactive: !profile.is_active,
        statusLabel: profile.status_label,
        registrationNumber: findFieldValue(juridical, 'Număr registru'),
        caenCode: profile.primary_caen_display,
        vatRegistered: vatStatus === 'Plătitor TVA',
        eFacturaRegistered: null
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError || new Error("cuifirma API failed after retries");
}

export async function getCompanyFromANAFWithFallback(cif, cachedData = null) {
  try {
    return await getCompanyFromANAF(cif);
  } catch (err) {
    console.log(`\n\u26a0\ufe0f cuifirma API unavailable: ${err.message}`);
    if (cachedData) {
      console.log("\u2705 Using cached company data as fallback");
      return cachedData;
    }
    throw err;
  }
}

export async function searchCompany(brandName) {
  const result = await mcpCall('search-firms', { query: brandName });
  return (result.results || []).map(r => ({
    cui: r.cui,
    name: r.name,
    statusLabel: r.status_label,
    isActive: r.is_active
  }));
}
