import { generateVersionInfoJson, getVersionInfoUrl } from "./version-info";
import type { Issue, VersionInfoFile } from "./types";

describe("version-info", () => {
  describe("generateVersionInfoJson", () => {
    const issues = [
      {
        number: 1,
        title: "New Issue 1",
        labels: [{ name: "Type:Bug" }],
      },
      {
        number: 2,
        title: "New Issue 2",
        labels: [{ name: "Type:Enhancement" }],
      },
    ] as Issue[];

    const moreIssues = [
      {
        number: 3,
        title: "New Issue 3",
        labels: [{ name: "Type:Bug" }],
      },
      {
        number: 4,
        title: "New Issue 4",
        labels: [{ name: "Type:Enhancement" }],
      },
    ] as Issue[];

    const oldJson = {
      latest: {
        version: "v0.2.3",
        released: "2021-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
      },
      older: [],
    } as VersionInfoFile;

    it("should add new latest version to version info json", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: issues,
        version: "v0.3.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.latest).toEqual({
        version: "v0.3.0",
        released: expect.any(String),
        patch: false,
        highlights: ["New Issue 1", "New Issue 2"],
      });
    });

    it("should move old latest version to older array", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: issues,
        version: "v0.3.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older).toEqual([oldJson.latest]);
    });

    it("properly records patch releases", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: moreIssues,
        version: "v0.45.1",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.latest.patch).toEqual(true);
    });

    it("properly recognizes major releases", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: moreIssues,
        version: "v0.45.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.latest.patch).toEqual(false);
    });

    it("should ignore a non-latest release", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: issues,
        version: "v0.1.9",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson).toEqual(oldJson);
    });

    it("should ignore an already released version", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: moreIssues,
        version: "v0.2.3",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson).toEqual(oldJson);
    });
  });

  describe("getVersionInfoUrl", () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AWS_S3_STATIC_BUCKET = "my.metabase.com";
      process.env.AWS_REGION = "us-north-9";
    });

    it("should generate oss version info url", () => {
      expect(getVersionInfoUrl("v0.99.3")).toEqual(
        "http://my.metabase.com.s3.us-north-9.amazonaws.com/version-info.json",
      );
    });

    it("should generate ee version info url", () => {
      expect(getVersionInfoUrl("v1.99.3")).toEqual(
        "http://my.metabase.com.s3.us-north-9.amazonaws.com/version-info-ee.json",
      );
    });
  });
});
