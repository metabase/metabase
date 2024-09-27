import type { Issue, VersionInfoFile } from "./types";
import { generateVersionInfoJson, getVersionInfoUrl, updateVersionInfoChannelJson, updateVersionInfoLatestJson } from "./version-info";

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

    it("should add new version to version info json", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: issues,
        version: "v0.3.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older).toEqual([{
        version: "v0.3.0",
        released: expect.any(String),
        patch: false,
        highlights: ["New Issue 1", "New Issue 2"],
      }]);
    });

    it("should leave old latest version intact", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: issues,
        version: "v0.3.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.latest).toEqual(oldJson.latest);
    });

    it("properly records patch releases", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: moreIssues,
        version: "v0.45.1",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older[0].patch).toEqual(true);
    });

    it("properly recognizes major releases", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: moreIssues,
        version: "v0.45.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older[0].patch).toEqual(false);
    });

    it("should always record releases in older array", () => {
      const generatedJson = generateVersionInfoJson({
        milestoneIssues: issues,
        version: "v0.1.9",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older[0]).toEqual({
        version: "v0.1.9",
        released: expect.any(String),
        patch: true,
        highlights: ["New Issue 1", "New Issue 2"],
      });
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

  describe("updateVersionInfoLatestJson", () => {
    const oldJson = {
      latest: {
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
      },
      older: [
        {
          version: "v0.2.5",
          released: "2023-01-01",
          patch: true,
          highlights: ["New Issue 31", "New Issue 41"],
        },
        {
          version: "v0.2.3",
          released: "2021-01-01",
          patch: true,
          highlights: ["Old Issue 3", "Old Issue 4"],
        },
        {
          version: "v0.2.2",
          released: "2020-01-01",
          patch: true,
          highlights: ["Old Issue 5", "Old Issue 6"],
        },
      ],
    } as VersionInfoFile;

    it("should update latest version", () => {
      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.5",
        existingVersionInfo: oldJson,
      });

      expect(updatedJson.latest.version).toEqual("v0.2.5");
    });

    it("should ignore if version is already latest", () => {
      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.4",
        existingVersionInfo: oldJson,
      });

      expect(updatedJson).toEqual(oldJson);
    });

    it("should throw if new version is not in older versions", () => {
      expect(() => updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.1",
        existingVersionInfo: oldJson,
      })).toThrow();
    });

    it("should remove the new latest version from the older versions", () => {
      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.5",
        existingVersionInfo: oldJson,
      });

      expect(updatedJson.older).not.toContainEqual({
        version: "v0.2.5",
        released: "2023-01-01",
        patch: true,
        highlights: ["New Issue 31", "New Issue 41"],
      });
    });

    it("should keep the old latest version in the older versions", () => {
      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.5",
        existingVersionInfo: oldJson,
      });

      expect(updatedJson.older).toContainEqual({
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
      });
    });

    it("should update rollout % on new latest version", () => {
      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.5",
        existingVersionInfo: oldJson,
        rollout: 51,
      });

      expect(updatedJson.latest.rollout).toEqual(51);
    });

    it("should update rollout % on old latest version", () => {
      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.4",
        existingVersionInfo: oldJson,
        rollout: 51,
      });

      expect(updatedJson.latest).toEqual({
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
        rollout: 51,
      });

      const updatedJson2 = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.4",
        existingVersionInfo: updatedJson,
        rollout: 59,
      });

      expect(updatedJson2.latest).toEqual({
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
        rollout: 59,
      });
    });

    it("should remove rollout % on old latest version", () => {

      const updatedJson = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.4",
        existingVersionInfo: oldJson,
        rollout: 51,
      });

      const updatedJson2 = updateVersionInfoLatestJson({
        newLatestVersion: "v0.2.5",
        existingVersionInfo: updatedJson,
        rollout: 100,
      });

      expect(updatedJson2.latest).toEqual({
        version: "v0.2.5",
        released: "2023-01-01",
        patch: true,
        highlights: ["New Issue 31", "New Issue 41"],
        rollout: 100,
      });

      expect(updatedJson2.older[0]).toEqual({
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
        // no rollout
      });
    });
  });

  describe("updateVersionInfoChannelJson", () => {
    const oldJson = {
      latest: {
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
      },
      nightly: {
        version: "v0.2.4.1",
        released: "2022-01-03",
        patch: true,
        highlights: [],
      },
      beta: {
        version: "v0.2.6",
        released: "2022-01-02",
        patch: true,
        highlights: [],
      },
      older: [
        {
          version: "v0.2.5",
          released: "2023-01-01",
          patch: true,
          highlights: ["New Issue 31", "New Issue 41"],
        },
        {
          version: "v0.2.3",
          released: "2021-01-01",
          patch: true,
          highlights: ["Old Issue 3", "Old Issue 4"],
        },
        {
          version: "v0.2.2",
          released: "2020-01-01",
          patch: true,
          highlights: ["Old Issue 5", "Old Issue 6"],
        },
      ],
    } as VersionInfoFile;

    it("should update nightly version", () => {
      const updatedJson = updateVersionInfoChannelJson({
        version: "v0.2.4.2",
        existingVersionInfo: oldJson,
        channel: "nightly",
        rollout: 51,
      });

      expect(updatedJson.nightly).toEqual({
        version: "v0.2.4.2",
        released: expect.any(String),
        rollout: 51,
        highlights: [],
      });
    });

    it("should update beta version", () => {
      const updatedJson = updateVersionInfoChannelJson({
        version: "v0.2.7",
        existingVersionInfo: oldJson,
        channel: "beta",
        rollout: 51,
      });

      expect(updatedJson.beta).toEqual({
        version: "v0.2.7",
        released: expect.any(String),
        rollout: 51,
        highlights: [],
      });
    });

    it("should update latest version", () => {
      const updatedJson = updateVersionInfoChannelJson({
        version: "v0.2.5", // must be in the older array
        existingVersionInfo: oldJson,
        channel: "latest",
        rollout: 51,
      });

      expect(updatedJson.latest).toEqual({
        version: "v0.2.5",
        released: expect.any(String),
        rollout: 51,
        patch: true,
        highlights: ["New Issue 31", "New Issue 41"],
      });

      expect(updatedJson.older).toContainEqual({
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1", "Old Issue 2"],
      });
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
