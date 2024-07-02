import { generateReleaseNotes, getReleaseTitle, categorizeIssues } from "./release-notes";
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
        labels: [{ name: "Type:Bug" }],
      },
      {
        number: 2,
        title: "Feature Issue",
        labels: [{ name: "something" }],
      },
      {
        number: 3,
        title: "Issue Already Fixed",
        labels: [{ name: ".Already Fixed" }],
      },
      {
        number: 4,
        title: "Issue That Users Don't Care About",
        labels: [{ name: ".CI & Tests" }],
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

      expect(notes).toContain("**Enhancements**\n\n- Feature Issue (#2)");
      expect(notes).toContain("**Bug fixes**\n\n- Bug Issue (#1)");
      expect(notes).toContain("**Already Fixed**\n\nIssues that we have recently confirmed to have been fixed at some point in the past.\n\n- Issue Already Fixed (#3)");
      expect(notes).toContain("**Under the Hood**\n\n- Issue That Users Don't Care About (#4)");

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

      expect(notes).toContain("**Enhancements**\n\n- Feature Issue (#2)");
      expect(notes).toContain("**Bug fixes**\n\n- Bug Issue (#1)");
      expect(notes).toContain("**Already Fixed**\n\nIssues that we have recently confirmed to have been fixed at some point in the past.\n\n- Issue Already Fixed (#3)");
      expect(notes).toContain("**Under the Hood**\n\n- Issue That Users Don't Care About (#4)");

      expect(notes).toContain("metabase/metabase-enterprise:v1.2.3");
      expect(notes).toContain(
        "https://downloads.metabase.com/enterprise/v1.2.3/metabase.jar",
      );
    });
  });

  describe('categorizeIssues', () => {
    it('should categorize bug issues', () => {
      const issue = {
          number: 1,
          title: "Bug Issue",
          labels: [{ name: "Type:Bug" }],
        } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.bugFixes).toEqual([issue]);
    });

    it('should categorize already fixed issues', () => {
      const issue = {
          number: 3,
          title: "Already Fixed Issue",
          labels: [{ name: ".Already Fixed" }],
        } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.alreadyFixedIssues).toEqual([issue]);
    });

    it('should categorize non-user-facing issues', () => {
      const issue = {
          number: 4,
          title: "Non User Facing Issue",
          labels: [{ name: ".CI & Tests" }],
        } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.underTheHoodIssues).toEqual([issue]);
    });

    it('should categorize all other issues as enhancements', () => {
      const issue = {
          number: 2,
          title: "Big Feature",
          labels: [{ name: "something" }],
        } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.enhancements).toEqual([issue]);
    });

    it('should prioritize non-user-facing issues above all', () => {
      const issue = {
        number: 4,
        title: "Non User Facing Issue",
        labels: [{ name: ".CI & Tests" }, { name: "Type:Bug" }, { name: ".Already Fixed" }, { name: "Ptitard" } ],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.underTheHoodIssues).toEqual([issue]);
      expect(categorizedIssues.bugFixes).toEqual([]);
      expect(categorizedIssues.alreadyFixedIssues).toEqual([]);
      expect(categorizedIssues.enhancements).toEqual([]);
    });

    it('should omit hidden issues', () => {
      const issue = {
        number: 5,
        title: "Docs Issue",
        labels: [{ name: "Type:Documentation" }],
      } as Issue;

      const categorizedIssues = categorizeIssues([issue]);

      expect(categorizedIssues.enhancements).toEqual([]);
      expect(categorizedIssues.bugFixes).toEqual([]);
      expect(categorizedIssues.alreadyFixedIssues).toEqual([]);
      expect(categorizedIssues.underTheHoodIssues).toEqual([]);
    });

    it('should put issues in only one bucket', () => {
      const issues = [
        {
          number: 1,
          title: "Bug Issue",
          labels: [{ name: "Type:Bug" }],
        },
        {
          number: 2,
          title: "Big Feature",
          labels: [{ name: "something" }],
        },
        {
          number: 3,
          title: "Already Fixed Issue",
          labels: [{ name: ".Already Fixed" }],
        },
        {
          number: 4,
          title: "Non User Facing Issue",
          labels: [{ name: ".CI & Tests" }],
        },
        {
          number: 5,
          title: "Non User Facing Issue 2",
          labels: [{ name: ".Building & Releasing" }],
        },
        {
          number: 6,
          title: "Docs Issue",
          labels: [{ name: "Type:Documentation" }],
        },
      ] as Issue[];

      const categorizedIssues = categorizeIssues(issues);

      expect(categorizedIssues.bugFixes).toEqual([issues[0]]);
      expect(categorizedIssues.enhancements).toEqual([issues[1]]);
      expect(categorizedIssues.alreadyFixedIssues).toEqual([issues[2]]);
      expect(categorizedIssues.underTheHoodIssues).toEqual([issues[3], issues[4]]);
    });
  });
});
