import { generateJobsMarkdown } from "../../src/markdown-generator.js";

const baseCompany = {
  id: "4565806",
  company: "WEST CO IMPEX SRL",
  brand: "West Company",
  status: "activ",
  location: ["Crișeni, Sălaj"],
  website: ["https://www.westcompany.ro"],
  career: ["https://www.westcompany.ro/cariere/"],
  lastScraped: "2026-06-17"
};

const baseJob = {
  url: "https://www.westcompany.ro/cariere/#sofer-categoria-c-e",
  title: "Șofer Categoria C+E",
  workmode: "on-site",
  location: ["Crișeni, Sălaj"],
  tags: ["sofer", "categoria ce"],
  status: "scraped"
};

describe("generateJobsMarkdown", () => {
  describe("company section", () => {
    it("includes company name as h1", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("# WEST CO IMPEX SRL");
    });

    it("includes CIF", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("4565806");
    });

    it("includes brand", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("West Company");
    });

    it("includes status", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("activ");
    });

    it("includes website as markdown link", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("[https://www.westcompany.ro](https://www.westcompany.ro)");
    });

    it("includes career page as markdown link", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("[https://www.westcompany.ro/cariere/](https://www.westcompany.ro/cariere/)");
    });

    it("includes lastScraped date", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("2026-06-17");
    });

    it("omits optional fields when not present", () => {
      const minimal = { id: "4565806", company: "WEST CO IMPEX SRL" };
      const md = generateJobsMarkdown(minimal, []);
      expect(md).toContain("# WEST CO IMPEX SRL");
      expect(md).not.toContain("Brand");
      expect(md).not.toContain("Last Scraped");
    });
  });

  describe("jobs section", () => {
    it("shows job count in heading", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("## Current Job Listings (1)");
    });

    it("shows 0 when no jobs", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toContain("## Current Job Listings (0)");
    });

    it("includes job title as h3", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("### Șofer Categoria C+E");
    });

    it("includes job URL as markdown link", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("[https://www.westcompany.ro/cariere/#sofer-categoria-c-e]");
    });

    it("includes workmode", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("on-site");
    });

    it("includes location", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("Crișeni, Sălaj");
    });

    it("includes tags", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("sofer, categoria ce");
    });

    it("includes status", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(md).toContain("scraped");
    });

    it("renders multiple jobs", () => {
      const job2 = { ...baseJob, title: "DevOps Engineer", url: "https://www.westcompany.ro/cariere/#devops-engineer" };
      const md = generateJobsMarkdown(baseCompany, [baseJob, job2]);
      expect(md).toContain("### Șofer Categoria C+E");
      expect(md).toContain("### DevOps Engineer");
      expect(md).toContain("## Current Job Listings (2)");
    });

    it("handles job with no optional fields", () => {
      const minimal = { url: "https://www.westcompany.ro/cariere/#qa-engineer", title: "QA Engineer" };
      const md = generateJobsMarkdown(baseCompany, [minimal]);
      expect(md).toContain("### QA Engineer");
      expect(md).not.toContain("Work Mode");
      expect(md).not.toContain("Tags");
    });
  });

  describe("output format", () => {
    it("returns a non-empty string", () => {
      const md = generateJobsMarkdown(baseCompany, [baseJob]);
      expect(typeof md).toBe("string");
      expect(md.length).toBeGreaterThan(0);
    });

    it("includes a generated timestamp", () => {
      const md = generateJobsMarkdown(baseCompany, []);
      expect(md).toMatch(/_Generated: \d{4}-\d{2}-\d{2}/);
    });
  });
});
