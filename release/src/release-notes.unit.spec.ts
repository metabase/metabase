import { generateReleaseNotes, getReleaseTitle } from "./release-notes";
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
        title: "Issue 1",
        labels: [{ name: "Type:Bug" }],
      },
      {
        number: 2,
        title: "Issue 2",
        labels: [{ name: "Type:Enhancement" }],
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

      expect(notes).toContain("**Enhancements**\n\n- Issue 2 (#2)");
      expect(notes).toContain("**Bug fixes**\n\n- Issue 1 (#1)");

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

      expect(notes).toContain("**Enhancements**\n\n- Issue 2 (#2)");
      expect(notes).toContain("**Bug fixes**\n\n- Issue 1 (#1)");

      expect(notes).toContain("metabase/metabase-enterprise:v1.2.3");
      expect(notes).toContain(
        "https://downloads.metabase.com/enterprise/v1.2.3/metabase.jar",
      );
    });
  });
});
