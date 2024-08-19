import {
  generateReleaseNotes,
  getReleaseTitle,
  categorizeIssues,
} from "./release-notes";
import type { Issue } from "./types";

describe("Release Notes", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DOCKERHUB_OWNER = "metabase";
    process.env.DOCKERHUB_REPO = "metabase";
    process.env.AWS_S3_DOWNLOADS_BUCKET = "downloads.metabase.com";
  });

  describe("getReleaseTitle", () => {
    it("should generate open source release title", () => {
      expect(getReleaseTitle("v0.2.3")).toEqual("Metabase v0.2.3");
    });

    it("should generate enterprise release title", () => {
      expect(getReleaseTitle("v1.2.3")).toEqual(
        "Metabase® Enterprise Edition™ v1.2.3",
      );
    });
  });

  describe("generateReleaseNotes", () => {
    const issues = [
      {
        number: 1,
        title: "Bug Issue",
        labels: [{ name: "Type:Bug" }, { name: "Embedding/Interactive" }],
      },
      {
        number: 2,
        title: "Feature Issue",
        labels: [{ name: "Querying/MBQL" }],
      },
      {
        number: 3,
        title: "Issue Already Fixed",
        labels: [{ name: ".Already Fixed" }, { name: "Embedding/Static" }],
      },
      {
        number: 4,
        title: "Issue That Users Don't Care About",
        labels: [
          { name: ".CI & Tests" },
          { name: "Administration/Permissions" },
          { name: "Embedding/Interactive" },
        ],
      },
      {
        number: 5,
        title: "Another feature issue",
        labels: [{ name: "Reporting/Dashboards" }],
      },
      {
        number: 6,
        title: "A bug fix that lacks a category label",
        labels: [{ name: "Type:Bug" }],
      },
    ] as Issue[];

    it("should generate open source release notes", () => {
      const notes = generateReleaseNotes({
        version: "v0.2.3",
        checksum: "1234567890abcdef",
        issues,
      });

      expect(notes).toContain("SHA-256 checksum for the v0.2.3 JAR");
      expect(notes).toContain("1234567890abcdef");

      expect(notes).toContain(
        "### Enhancements\n\n**Querying**\n\n- Feature Issue (#2)",
      );
      expect(notes).toContain(
        "### Bug fixes\n\n**Embedding**\n\n- Bug Issue (#1)",
      );
      expect(notes).toContain(
        "### Already Fixed\n\nIssues confirmed to have been fixed in a previous release.\n\n**Embedding**\n\n- Issue Already Fixed (#3)",
      );
      expect(notes).toContain(
        "### Under the Hood\n\n**Administration**\n\n- Issue That Users Don't Care About (#4)",
      );

      expect(notes).toContain("metabase/metabase:v0.2.3");
      expect(notes).toContain(
        "https://downloads.metabase.com/v0.2.3/metabase.jar",
      );
    });

    it("should generate enterprise release notes", () => {
      const notes = generateReleaseNotes({
        version: "v1.2.3",
        checksum: "1234567890abcdef",
        issues,
      });

      expect(notes).toContain("SHA-256 checksum for the v1.2.3 JAR");
      expect(notes).toContain("1234567890abcdef");

      expect(notes).toContain(
        "### Enhancements\n\n**Querying**\n\n- Feature Issue (#2)",
      );
      expect(notes).toContain(
        "### Bug fixes\n\n**Embedding**\n\n- Bug Issue (#1)",
      );
      expect(notes).toContain(
        "### Already Fixed\n\nIssues confirmed to have been fixed in a previous release.\n\n**Embedding**\n\n- Issue Already Fixed (#3)",
      );
      expect(notes).toContain(
        "### Under the Hood\n\n**Administration**\n\n- Issue That Users Don't Care About (#4)",
      );

      expect(notes).toContain("metabase/metabase-enterprise:v1.2.3");
      expect(notes).toContain(
        "https://downloads.metabase.com/enterprise/v1.2.3/metabase.jar",
      );
    });
  });

  describe("categorizeIssues", () => {
    it("should categorize bug issues", () => {
      const issue = {
        number: 1,
        title: "Bug Issue",
        labels: [{ name: "Type:Bug" }, { name: "Querying/MBQL" }],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);
      const issuesAndCategories = {
        Querying: [
          {
            labels: [{ name: "Type:Bug" }, { name: "Querying/MBQL" }],
            number: 1,
            title: "Bug Issue",
          },
        ],
      };

      expect(categorizedIssues.bugFixes).toEqual(issuesAndCategories);
    });

    it("should categorize already fixed issues", () => {
      const issue = {
        number: 3,
        title: "Already Fixed Issue",
        labels: [{ name: ".Already Fixed" }],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);
      const sortedIssues = {
        bugFixes: {},
        enhancements: {},
        alreadyFixedIssues: {
          Other: [
            {
              number: 3,
              title: "Already Fixed Issue",
              labels: [
                {
                  name: ".Already Fixed",
                },
              ],
            },
          ],
        },
        underTheHoodIssues: {},
      };

      expect(categorizedIssues.alreadyFixedIssues).toEqual(
        sortedIssues.alreadyFixedIssues,
      );
    });

    it("should categorize non-user-facing issues", () => {
      const issue = {
        number: 4,
        title: "Non User Facing Issue",
        labels: [{ name: ".CI & Tests" }],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);
      const sortedIssues = {
        bugFixes: {},
        enhancements: {},
        alreadyFixedIssues: {},
        underTheHoodIssues: {
          Other: [
            {
              number: 4,
              title: "Non User Facing Issue",
              labels: [{ name: ".CI & Tests" }],
            },
          ],
        },
      };

      expect(categorizedIssues.underTheHoodIssues).toEqual(
        sortedIssues.underTheHoodIssues,
      );
    });

    it("should categorize all other issues as enhancements", () => {
      const issue = {
        number: 2,
        title: "Big Feature",
        labels: [{ name: "something" }],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);
      const sortedIssues = {
        bugFixes: {},
        enhancements: {
          Other: [
            {
              number: 2,
              title: "Big Feature",
              labels: [{ name: "something" }],
            },
          ],
        },
        alreadyFixedIssues: {},
        underTheHoodIssues: {},
      };
      expect(categorizedIssues.enhancements).toEqual(sortedIssues.enhancements);
    });

    it("should prioritize non-user-facing issues above all", () => {
      const issue = {
        number: 4,
        title: "Non User Facing Issue",
        labels: [
          { name: ".CI & Tests" },
          { name: "Type:Bug" },
          { name: ".Already Fixed" },
          { name: "Ptitard" },
        ],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      const sortedIssues = {
        bugFixes: {},
        enhancements: {},
        alreadyFixedIssues: {},
        underTheHoodIssues: {
          Other: [
            {
              number: 4,
              title: "Non User Facing Issue",
              labels: [
                {
                  name: ".CI & Tests",
                },
                {
                  name: "Type:Bug",
                },
                {
                  name: ".Already Fixed",
                },
                {
                  name: "Ptitard",
                },
              ],
            },
          ],
        },
      };

      expect(categorizedIssues.underTheHoodIssues).toEqual(
        sortedIssues.underTheHoodIssues,
      );
      expect(categorizedIssues.bugFixes).toEqual({});
      expect(categorizedIssues.alreadyFixedIssues).toEqual({});
      expect(categorizedIssues.enhancements).toEqual({});
    });

    it("should omit hidden issues", () => {
      const issue = {
        number: 5,
        title: "Docs Issue",
        labels: [{ name: "Type:Documentation" }],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.enhancements).toEqual({});
      expect(categorizedIssues.bugFixes).toEqual({});
      expect(categorizedIssues.alreadyFixedIssues).toEqual({});
      expect(categorizedIssues.underTheHoodIssues).toEqual({});
    });

    it("should put issues in only one bucket", () => {
      const issues = [
        {
          number: 1,
          title: "Bug Issue",
          labels: [{ name: "Type:Bug" }, { name: "Embedding/Interactive" }],
        },
        {
          number: 2,
          title: "Big Feature",
          labels: [{ name: "something" }, { name: "Querying/MBQL" }],
        },
        {
          number: 3,
          title: "Already Fixed Issue",
          labels: [
            { name: ".Already Fixed" },
            { name: "Reporting/Dashboards" },
          ],
        },
        {
          number: 4,
          title: "Non User Facing Issue",
          labels: [{ name: ".CI & Tests" }],
        },
        {
          number: 5,
          title: "Non User Facing Issue 2",
          labels: [
            { name: ".Building & Releasing" },
            { name: "Visualization/Tables" },
          ],
        },
        {
          number: 6,
          title: "Docs Issue",
          labels: [
            { name: "Type:Documentation" },
            { name: "Reporting/Dashboards" },
            { name: "Databases/PostgreSQL" },
          ],
        },
      ] as Issue[];

      const categorizedIssues = categorizeIssues(issues);

      const sortedIssues = {
        bugFixes: {
          Embedding: [
            {
              number: 1,
              title: "Bug Issue",
              labels: [{ name: "Type:Bug" }, { name: "Embedding/Interactive" }],
            },
          ],
        },
        enhancements: {
          Querying: [
            {
              number: 2,
              title: "Big Feature",
              labels: [{ name: "something" }, { name: "Querying/MBQL" }],
            },
          ],
        },
        alreadyFixedIssues: {
          Reporting: [
            {
              number: 3,
              title: "Already Fixed Issue",
              labels: [
                { name: ".Already Fixed" },
                { name: "Reporting/Dashboards" },
              ],
            },
          ],
        },
        underTheHoodIssues: {
          Other: [
            {
              number: 4,
              title: "Non User Facing Issue",
              labels: [{ name: ".CI & Tests" }],
            },
          ],
          Visualization: [
            {
              number: 5,
              title: "Non User Facing Issue 2",
              labels: [
                { name: ".Building & Releasing" },
                { name: "Visualization/Tables" },
              ],
            },
          ],
        },
      };

      expect(categorizedIssues.bugFixes).toEqual(sortedIssues.bugFixes);
      expect(categorizedIssues.enhancements).toEqual(sortedIssues.enhancements);
      expect(categorizedIssues.alreadyFixedIssues).toEqual(
        sortedIssues.alreadyFixedIssues,
      );
      expect(categorizedIssues.underTheHoodIssues).toEqual(
        sortedIssues.underTheHoodIssues,
      );
    });
  });
});
