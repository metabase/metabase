import {
  categorizeIssues,
  generateReleaseNotes,
  getChangelogUrl,
  getReleaseTitle,
  getWebsiteChangelog,
  markdownIssueLinks,
} from "./release-notes";
import {
  githubReleaseTemplate,
  websiteChangelogTemplate,
} from "./release-notes-templates";
import type { Issue } from "./types";

describe("Release Notes", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DOCKERHUB_OWNER = "metabase";
    process.env.DOCKERHUB_REPO = "metabase";
    process.env.AWS_S3_DOWNLOADS_BUCKET = "downloads.metabase.com";
  });

  describe("getReleaseTitle", () => {
    it("should generate generic release title", () => {
      expect(getReleaseTitle("v1.2.3")).toEqual("Metabase 2.3");

      expect(getReleaseTitle("v0.2.3")).toEqual("Metabase 2.3");
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
      {
        number: 7,
        title: "SDK Package Bug Issue",
        labels: [
          { name: "Type:Bug" },
          { name: ".team/Embedding" },
          { name: "no-release-notes" },
        ],
      },
      {
        number: 8,
        title: "SDK Bundle Bug Issue",
        labels: [
          { name: "Type:Bug" },
          { name: ".team/Embedding" },
          { name: "Embedding/SDK" },
        ],
      },
      {
        number: 9,
        title: "SDK Bundle Another Bug Issue",
        labels: [{ name: "Type:Bug" }, { name: "Embedding/SDK" }],
      },
    ] as Issue[];

    it("should generate release notes", () => {
      const notes = generateReleaseNotes({
        version: "v1.2.3",
        template: websiteChangelogTemplate,
        issues,
      });

      expect(notes).toContain(
        "### Enhancements | 2.3\n\n**Querying**\n\n- Feature Issue (#2)",
      );
      expect(notes).toContain(
        "### Bug fixes | 2.3\n\n**Embedding**\n\n- Bug Issue (#1)\n- SDK Bundle Bug Issue (#8)\n- SDK Bundle Another Bug Issue (#9)",
      );
      expect(notes).toContain(
        "### Already Fixed | 2.3\n\nIssues confirmed to have been fixed in a previous release.\n\n**Embedding**\n\n- Issue Already Fixed (#3)",
      );
      expect(notes).toContain(
        "### Under the Hood | 2.3\n\n**Administration**\n\n- Issue That Users Don't Care About (#4)",
      );

      expect(notes).toContain("metabase/metabase-enterprise:v1.2.3.x");
      expect(notes).toContain("metabase/metabase:v0.2.3.x");
      expect(notes).toContain(
        "https://downloads.metabase.com/enterprise/v1.2.3.x/metabase.jar",
      );
      expect(notes).toContain(
        "https://downloads.metabase.com/v0.2.3.x/metabase.jar",
      );
      expect(notes).not.toContain("SDK Package Bug Issue");
    });

    it("should generate release notes from alternative templates", () => {
      const notes = generateReleaseNotes({
        version: "v1.2.3",
        template: githubReleaseTemplate,
        issues,
      });

      expect(notes).toContain("https://www.metabase.com/changelog/");

      expect(notes).toContain("metabase/metabase-enterprise:v1.2.3.x");
      expect(notes).toContain("metabase/metabase:v0.2.3.x");
      expect(notes).toContain(
        "https://downloads.metabase.com/enterprise/v1.2.3.x/metabase.jar",
      );
      expect(notes).toContain(
        "https://downloads.metabase.com/v0.2.3.x/metabase.jar",
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

  describe("markdownIssuelinks", () => {
    it("should generate markdown links for a single issue", () => {
      expect(markdownIssueLinks("(#12345) is done")).toEqual(
        "([#12345](https://github.com/metabase/metabase/issues/12345)) is done",
      );
    });

    it("should generate markdown links for a multiple issues", () => {
      expect(
        markdownIssueLinks(`
        (#12345) is done
        (#12346) is not done
        12348 is not an issue
      `),
      ).toEqual(`
        ([#12345](https://github.com/metabase/metabase/issues/12345)) is done
        ([#12346](https://github.com/metabase/metabase/issues/12346)) is not done
        12348 is not an issue
      `);
    });

    it("should preserve text without issue numbers", () => {
      expect(markdownIssueLinks("my text")).toEqual("my text");
    });
  });

  describe("getWebsiteChangelog", () => {
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

    it("should generate a website changelog", () => {
      const notes = getWebsiteChangelog({
        version: "v1.2.3",
        issues,
      });

      expect(notes).toContain("### Enhancements");
      expect(notes).toContain("Metabase 2.3");
      expect(notes).toContain("- Issue That Users Don't Care About");
    });

    it("should linkify issue numbers", () => {
      const notes = getWebsiteChangelog({
        version: "v1.2.3",
        issues,
      });

      expect(notes).toContain("### Enhancements");
      expect(notes).toContain(
        "- Issue That Users Don't Care About ([#4](https://github.com/metabase/metabase/issues/4))",
      );
    });
  });

  it.each([
    ["v0.53.2", "53#metabase-532"],
    ["v1.53.0", "53#metabase-530"],
    ["v1.57.16", "57#metabase-5716"],
    ["v1.59.0.4-beta", "59#metabase-590"],
    ["v1.60.0", "60#metabase-600"],
    ["v0.32.0", "32#metabase-320"],
    ["v0.444.1", "444#metabase-4441"],
  ])("getChangelogUrl: %s -> %s", (input, expected) => {
    expect(getChangelogUrl(input)).toEqual(
      `https://www.metabase.com/changelog/${expected}`,
    );
  });
});
