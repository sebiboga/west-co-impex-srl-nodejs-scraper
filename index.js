import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs, upsertCompany } from "./solr.js";
import { generateJobsMarkdown } from "./src/markdown-generator.js";
import companyConfig from "./config/company.js";

const COMPANY_CIF = companyConfig.cif;
const JOB_BASE = companyConfig.apiBase;
const TIMEOUT = 10000;
let COMPANY_NAME = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchANOFM(cif) {
  const jobs = [];
  try {
    console.log(`Searching ANOFM by CIF: ${cif}`);
    const payload = {
      current: 1,
      rowCount: 250,
      sort: { created_at: "desc" },
      employer_tax_code: cif
    };
    const res = await fetch("https://mediere.anofm.ro/api/entity/vw_public_job_posting", {
      method: "POST",
      timeout: TIMEOUT,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "job_seeker_ro_spider"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.log(`  ANOFM returned ${res.status}`);
      return jobs;
    }
    const data = await res.json();
    for (const row of data.rows || []) {
      const locationParts = (row.address_locality_name || '').split('>').map(s => s.trim());
      const location = locationParts.length > 1 ? locationParts[locationParts.length - 1] : locationParts[0];
      jobs.push({
        url: `https://mediere.anofm.ro/app/module/mediere/job/${row.id}`,
        title: row.occupation,
        location: location ? [location] : undefined,
        source: "ANOFM"
      });
    }
    console.log(`  Found ${jobs.length} jobs on ANOFM`);
  } catch (err) {
    console.log(`  ANOFM error: ${err.message}`);
  }
  return jobs;
}

async function fetchJobsPage() {
  const url = `${JOB_BASE}/cariere/`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "job_seeker_ro_spider"
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} fetching careers page`);
  }
  const html = await res.text();
  return html;
}

function normalizeLocation(loc) {
  const knownCities = {
    "crișeni": "Crișeni",
    "criseni": "Crișeni",
    "sălaj": "Sălaj",
    "salaj": "Sălaj",
    "zalău": "Zalău",
    "zalau": "Zalău"
  };
  const parts = loc.trim().split(",").map(p => p.trim());
  const normalized = parts.map(p => knownCities[p.toLowerCase()] || p);
  return normalized.join(", ");
}

function parseJobs(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  const seenTitles = new Set();

  $("h2, h3").each((_, el) => {
    const title = $(el).text().trim();
    if (!title || title.length < 3) return;
    if (seenTitles.has(title)) return;

    const parentSection = $(el).closest(".elementor-section, section") || $(el).parent();
    const sectionText = parentSection.length ? parentSection.text() : $(el).text();

    let location = [];
    if (sectionText.match(/Crișeni|Sălaj|Zalău/i)) {
      const locMatch = sectionText.match(/(?:location|loc|locality|oraș|jud|in)\s*[:\s]+([A-Z][a-zăâîșț]+(?:,\s*[A-Z][a-zăâîșț]+)?)/i) ||
                       sectionText.match(/(Crișeni|Sălaj|Zalău)(?:,\s*[A-Z][a-zăâîșț]+)?/i);
      if (locMatch) {
        location = [normalizeLocation(locMatch[1])];
      } else {
        location = ["Crișeni, Sălaj"];
      }
    }

    const urlTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const jobUrl = `https://www.westcompany.ro/cariere/#${urlTitle}`;

    seenTitles.add(title);

    const isFullTime = sectionText.includes("Full Time");
    const workmode = isFullTime ? "on-site" : undefined;

    jobs.push({
      url: jobUrl,
      title,
      workmode,
      location,
      tags: []
    });
  });

  if (jobs.length === 0) {
    const bodyText = $("body").text();
    const jobMatches = bodyText.matchAll(/(Full Time)\s+([A-Z][A-Za-zăâîșț\s\-\(\)]+?)(?=\s+(Romania|România))/g);
    for (const match of jobMatches) {
      const title = match[2].trim();
      if (!seenTitles.has(title)) {
        seenTitles.add(title);
        const urlTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        jobs.push({
          url: `https://www.westcompany.ro/cariere/#${urlTitle}`,
          title,
          workmode: "on-site",
          location: ["Crișeni, Sălaj"],
          tags: []
        });
      }
    }
  }

  return { jobs, total: jobs.length };
}

async function scrapeAllListings(testOnlyOnePage = false) {
  const allJobs = [];
  const seenUrls = new Set();

  console.log("Fetching careers page...");
  const html = await fetchJobsPage();
  const result = parseJobs(html);
  const jobs = result.jobs;

  for (const job of jobs) {
    if (!seenUrls.has(job.url)) {
      seenUrls.add(job.url);
      allJobs.push(job);
    }
  }

  console.log(`Total jobs found: ${allJobs.length}`);
  return allJobs;
}

function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();
  const job = {
    url: rawJob.url,
    title: rawJob.title,
    company: companyName,
    cif: cif,
    location: rawJob.location?.length ? rawJob.location : undefined,
    tags: rawJob.tags?.length ? rawJob.tags : undefined,
    workmode: rawJob.workmode || undefined,
    date: now,
    status: "scraped"
  };
  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);
  return job;
}

function transformJobsForSOLR(payload) {
  const romanianCities = [
    'Bucharest', 'București', 'Cluj-Napoca', 'Cluj Napoca',
    'Timișoara', 'Timisoara', 'Iași', 'Iasi', 'Brașov', 'Brasov',
    'Constanța', 'Constanta', 'Craiova', 'Bacău', 'Sibiu',
    'Târgu Mureș', 'Targu Mures', 'Oradea', 'Baia Mare', 'Satu Mare',
    'Ploiești', 'Ploiesti', 'Pitești', 'Pitesti', 'Arad', 'Galați', 'Galati',
    'Brăila', 'Braila', 'Drobeta-Turnu Severin', 'Râmnicu Vâlcea', 'Ramnicu Valcea',
    'Buzău', 'Buzau', 'Botoșani', 'Botosani', 'Zalău', 'Zalau', 'Hunedoara', 'Deva',
    'Suceava', 'Bistrița', 'Bistrita', 'Tulcea', 'Călărași', 'Calarasi',
    'Giurgiu', 'Alba Iulia', 'Slatina', 'Piatra Neamț', 'Piatra Neamt', 'Roman',
    'Dumbrăvița', 'Dumbravita', 'Voluntari', 'Popești-Leordeni', 'Popesti-Leordeni',
    'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni',
    'Crișeni', 'Criseni', 'Sălaj', 'Salaj'
  ];
  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(),
    jobs: payload.jobs.map(job => {
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'],
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

async function main() {
  const testOnlyOnePage = process.argv.includes("--test");

  try {
    fs.mkdirSync("tmp", { recursive: true });

    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif, address } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;

    try {
      await upsertCompany({
        id: cif,
        company,
        brand: companyConfig.brand,
        status: "activ",
        location: address ? [address] : [companyConfig.defaultLocation],
        website: [companyConfig.website],
        career: [companyConfig.careerUrl],
        lastScraped: new Date().toISOString().split('T')[0],
        scraperFile: companyConfig.scraperFile
      });
    } catch (err) {
      console.log(`Note: Could not upsert company to SOLR core: ${err.message}`);
    }

    const rawJobs = await scrapeAllListings(testOnlyOnePage);
    const scrapedCount = rawJobs.length;
    console.log(`Jobs scraped from careers page: ${scrapedCount}`);

    if (!testOnlyOnePage) {
      const anofmJobs = await searchANOFM(localCif);
      const anofmCount = anofmJobs.length;
      for (const job of anofmJobs) {
        if (!rawJobs.find(j => j.url === job.url)) {
          rawJobs.push(job);
        }
      }
      console.log(`Jobs added from ANOFM: ${anofmCount}`);
    }

    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    const payload = {
      source: "westcompany.ro",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`Jobs with valid Romanian locations: ${validCount}`);

    fs.writeFileSync("tmp/jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved tmp/jobs.json");

    const companyData = {
      id: localCif,
      company: transformedPayload.company,
      brand: companyConfig.brand,
      status: "activ",
      location: address ? [address] : [companyConfig.defaultLocation],
      website: [companyConfig.website],
      career: [companyConfig.careerUrl],
      lastScraped: new Date().toISOString().split('T')[0]
    };
    const markdown = generateJobsMarkdown(companyData, transformedPayload.jobs);
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/jobs.md", markdown, "utf-8");
    console.log("Saved docs/jobs.md");

    fs.writeFileSync("docs/company.json", JSON.stringify(companyConfig, null, 2), "utf-8");
    console.log("Saved docs/company.json");

    console.log("\n=== Step 6: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`Jobs scraped from careers page: ${scrapedCount}`);
    console.log(`Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`===============`);

    console.log("\n=== DONE ===");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { parseJobs, mapToJobModel, transformJobsForSOLR };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
