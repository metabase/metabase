import {
  generateReleaseNotes,
  getReleaseTitle,
} from "./release-notes";
import { githubReleaseTemplate } from "./release-notes-templates";

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
    it("should generate github release notes", () => {
      const notes = generateReleaseNotes({
        version: "v1.2.3",
        template: githubReleaseTemplate,
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
});
