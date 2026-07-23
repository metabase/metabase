import fetch from "node-fetch";

import type { VersionInfoFile } from "./types";
import { generateVersionInfoJson, getSupportedMajors, getSupportedMajorVersions, getVersionInfoUrl, isVersionActiveLatestLts, isLatestActiveLts, updateVersionInfoLatest, updateVersionInfoLatestJson } from "./version-info";

jest.mock("node-fetch", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockFetch = jest.mocked(fetch);

describe("version-info", () => {
  describe("generateVersionInfoJson", () => {
    const oldJson = {
      latest: {
        version: "v0.2.3",
        released: "2021-01-01",
        patch: true,
        highlights: ["see https://www.metabase.com/changelog/2#metabase-23"],
      },
      older: [],
    } as VersionInfoFile;

    it("should add new version to version info json", () => {
      const generatedJson = generateVersionInfoJson({
        version: "v0.3.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older).toEqual([{
        version: "v0.3.0",
        released: expect.any(String),
        patch: false,
        highlights: ["see https://www.metabase.com/changelog/3#metabase-30"],
      }]);
    });

    it("should leave old latest version intact", () => {
      const generatedJson = generateVersionInfoJson({
        version: "v0.3.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.latest).toEqual(oldJson.latest);
    });

    it("properly records patch releases", () => {
      const generatedJson = generateVersionInfoJson({
        version: "v0.45.1",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older[0].patch).toEqual(true);
    });

    it("properly recognizes major releases", () => {
      const generatedJson = generateVersionInfoJson({
        version: "v0.45.0",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older[0].patch).toEqual(false);
    });

    it("should always record releases in older array", () => {
      const generatedJson = generateVersionInfoJson({
        version: "v0.1.9",
        existingVersionInfo: oldJson,
      });

      expect(generatedJson.older[0]).toEqual({
        version: "v0.1.9",
        released: expect.any(String),
        patch: true,
        highlights: ["see https://www.metabase.com/changelog/1#metabase-19"],
      });
    });

    it("should ignore an already released version", () => {
      const generatedJson = generateVersionInfoJson({
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
      expect(updatedJson.beta).toEqual(oldJson.beta);
      expect(updatedJson.nightly).toEqual(oldJson.nightly);
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

  describe("updateVersionInfoLatest", () => {
    const existingFile = {
      latest: {
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1"],
      },
      older: [
        {
          version: "v0.2.5",
          released: "2023-01-01",
          patch: true,
          highlights: ["New Issue"],
        },
      ],
    } as VersionInfoFile;

    beforeEach(() => {
      process.env.AWS_S3_STATIC_BUCKET = "my.metabase.com";
      process.env.AWS_REGION = "us-north-9";
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        json: async () => existingFile,
      } as Awaited<ReturnType<typeof fetch>>);
    });

    it("fetches the OSS version-info.json for a v0.* version", async () => {
      await updateVersionInfoLatest({ newVersion: "v0.2.5" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://my.metabase.com.s3.us-north-9.amazonaws.com/version-info.json",
      );
    });

    it("fetches the EE version-info-ee.json for a v1.* version", async () => {
      const eeFile = {
        latest: { ...existingFile.latest, version: "v1.2.4" },
        older: [{ ...existingFile.older[0], version: "v1.2.5" }],
      } as VersionInfoFile;
      mockFetch.mockResolvedValue({
        json: async () => eeFile,
      } as Awaited<ReturnType<typeof fetch>>);

      await updateVersionInfoLatest({ newVersion: "v1.2.5" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://my.metabase.com.s3.us-north-9.amazonaws.com/version-info-ee.json",
      );
    });

    it("promotes the new version to latest via updateVersionInfoLatestJson", async () => {
      const result = await updateVersionInfoLatest({
        newVersion: "v0.2.5",
        rollout: 42,
      });

      expect(result.latest).toEqual({
        version: "v0.2.5",
        released: "2023-01-01",
        patch: true,
        highlights: ["New Issue"],
        rollout: 42,
      });
      expect(result.older).toContainEqual({
        version: "v0.2.4",
        released: "2022-01-01",
        patch: true,
        highlights: ["Old Issue 1"],
      });
    });

    it("defaults rollout to 100 when omitted", async () => {
      const result = await updateVersionInfoLatest({ newVersion: "v0.2.5" });

      expect(result.latest.rollout).toEqual(100);
    });
  });

  describe("getSupportedMajorVersions", () => {
    const fileWith = (major_version_support: any) =>
      ({ latest: {}, older: [], major_version_support }) as unknown as VersionInfoFile;

    it("returns majors whose eol is today or later, newest first", () => {
      const versionInfo = fileWith([
        { major: 54, released: "2025-04-15", lts: true, eol: "2025-06-01" },
        { major: 60, released: "2026-04-01", lts: true, eol: "2027-06-01" },
        { major: 61, released: "2026-05-01", lts: false, eol: "2026-07-01" },
      ]);

      expect(getSupportedMajorVersions(versionInfo, "2026-06-04")).toEqual([
        61, 60,
      ]);
    });

    it("treats eol === today as still in support", () => {
      const versionInfo = fileWith([
        { major: 60, released: "2026-04-01", lts: true, eol: "2026-06-04" },
      ]);

      expect(getSupportedMajorVersions(versionInfo, "2026-06-04")).toEqual([60]);
    });

    it("ignores the lts flag — support is computed from eol only", () => {
      const versionInfo = fileWith([
        { major: 60, released: "2026-04-01", lts: false, eol: "2027-06-01" },
        { major: 54, released: "2025-04-15", lts: true, eol: "2025-06-01" },
      ]);

      expect(getSupportedMajorVersions(versionInfo, "2026-06-04")).toEqual([60]);
    });

    it("de-duplicates repeated majors", () => {
      const versionInfo = fileWith([
        { major: 60, released: "2026-04-01", lts: true, eol: "2027-06-01" },
        { major: 60, released: "2026-04-01", lts: true, eol: "2027-12-01" },
      ]);

      expect(getSupportedMajorVersions(versionInfo, "2026-06-04")).toEqual([60]);
    });

    it("throws when major_version_support is missing or empty", () => {
      expect(() => getSupportedMajorVersions(fileWith(undefined))).toThrow(
        /no `major_version_support`/,
      );
      expect(() => getSupportedMajorVersions(fileWith([]))).toThrow(
        /no `major_version_support`/,
      );
    });

    it("throws when every line is past end-of-life", () => {
      const versionInfo = fileWith([
        { major: 54, released: "2025-04-15", lts: true, eol: "2025-06-01" },
      ]);

      expect(() =>
        getSupportedMajorVersions(versionInfo, "2026-06-04"),
      ).toThrow(/No in-support major versions/);
    });
  });

  describe("getSupportedMajors", () => {
    beforeEach(() => {
      process.env.AWS_S3_STATIC_BUCKET = "my.metabase.com";
      process.env.AWS_REGION = "us-north-9";
      mockFetch.mockReset();
    });

    it("fetches the OSS version-info.json and returns supported majors", async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({
          latest: {},
          older: [],
          major_version_support: [
            { major: 60, released: "2026-04-01", lts: true, eol: "2027-06-01" },
            { major: 54, released: "2025-04-15", lts: true, eol: "2025-06-01" },
          ],
        }),
      } as Awaited<ReturnType<typeof fetch>>);

      const majors = await getSupportedMajors("2026-06-04");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://my.metabase.com.s3.us-north-9.amazonaws.com/version-info.json",
      );
      expect(majors).toEqual([60]);
    });
  });

  describe("isVersionActiveLatestLts", () => {
    const fileWith = (
      major_version_support: any,
      { latest = {}, older = [] }: { latest?: any; older?: any[] } = {},
    ) =>
      ({ latest, older, major_version_support }) as unknown as VersionInfoFile;

    const majorSupport = [
      { major: 54, released: "2025-04-15", lts: true, eol: "2025-06-01" }, // past eol
      { major: 60, released: "2026-04-01", lts: true, eol: "2027-06-01" }, // active LTS
      { major: 61, released: "2026-05-01", lts: false, eol: "2026-07-01" }, // active, not LTS
    ];

    // major 60 (active LTS) has released up to v0.60.3
    const versionInfo = fileWith(majorSupport, {
      latest: { version: "v0.61.0" },
      older: [{ version: "v0.60.3" }, { version: "v0.60.2" }],
    });

    it("returns true for an LTS version that is the latest release of its major", () => {
      expect(isVersionActiveLatestLts("v0.60.3", versionInfo, "2026-06-04")).toBe(
        true,
      );
    });

    it("returns true for an LTS version newer than the latest recorded release", () => {
      expect(isVersionActiveLatestLts("v0.60.4", versionInfo, "2026-06-04")).toBe(
        true,
      );
    });

    it("returns false for an LTS version older than the latest recorded release", () => {
      expect(isVersionActiveLatestLts("v0.60.2", versionInfo, "2026-06-04")).toBe(
        false,
      );
    });

    it("returns true for the first release of an LTS major with nothing recorded yet", () => {
      const freshInfo = fileWith(majorSupport, {
        latest: { version: "v0.61.0" },
        older: [],
      });

      expect(isVersionActiveLatestLts("v0.60.0", freshInfo, "2026-06-04")).toBe(
        true,
      );
    });

    it("resolves the major from an enterprise version string too", () => {
      expect(isVersionActiveLatestLts("v1.60.4", versionInfo, "2026-06-04")).toBe(
        true,
      );

      expect(isVersionActiveLatestLts("v1.60.2", versionInfo, "2026-06-04")).toBe(
        false,
      );
    });

    it("returns false when the version's major is in support but not an LTS", () => {
      expect(isVersionActiveLatestLts("v0.61.0", versionInfo, "2026-06-04")).toBe(
        false,
      );
    });

    it("returns false when the version's major is past end-of-life", () => {
      expect(isVersionActiveLatestLts("v0.54.9", versionInfo, "2026-06-04")).toBe(
        false,
      );
    });

    it("returns false when the version's major is not listed at all", () => {
      expect(isVersionActiveLatestLts("v0.99.0", versionInfo, "2026-06-04")).toBe(
        false,
      );
    });

    describe("with multiple active LTS majors (transition window)", () => {
      // both 58 and 60 are active LTS; 60 is the newest LTS and owns the tag
      const multiLtsSupport = [
        { major: 58, released: "2025-10-01", lts: true, eol: "2027-02-17" }, // older active LTS
        { major: 60, released: "2026-04-01", lts: true, eol: "2028-04-01" }, // newest active LTS
        { major: 61, released: "2026-05-01", lts: false, eol: "2026-07-01" }, // active, not LTS
      ];

      const multiLtsInfo = fileWith(multiLtsSupport, {
        latest: { version: "v0.61.0" },
        older: [
          { version: "v0.60.3" },
          { version: "v0.60.2" },
          { version: "v0.58.9" },
          { version: "v0.58.8" },
        ],
      });

      it("returns true for the latest release of the newest LTS major", () => {
        expect(
          isVersionActiveLatestLts("v0.60.3", multiLtsInfo, "2026-06-04"),
        ).toBe(true);
      });

      it("returns true for a release newer than the newest LTS major's latest", () => {
        expect(
          isVersionActiveLatestLts("v0.60.4", multiLtsInfo, "2026-06-04"),
        ).toBe(true);
      });

      it("returns false for the latest release of an older, still-active LTS major", () => {
        expect(
          isVersionActiveLatestLts("v0.58.9", multiLtsInfo, "2026-06-04"),
        ).toBe(false);
      });

      it("returns false for a release newer than the older LTS major's latest", () => {
        // even a brand-new 58.x must not drag the tag back off the newest LTS
        expect(
          isVersionActiveLatestLts("v0.58.10", multiLtsInfo, "2026-06-04"),
        ).toBe(false);
      });

      it("returns true for the first release of the newest LTS major", () => {
        const freshNewestLts = fileWith(multiLtsSupport, {
          latest: { version: "v0.61.0" },
          older: [{ version: "v0.58.9" }],
        });

        expect(
          isVersionActiveLatestLts("v0.60.0", freshNewestLts, "2026-06-04"),
        ).toBe(true);
      });
    });
  });

  describe("isLatestActiveLts", () => {
    beforeEach(() => {
      process.env.AWS_S3_STATIC_BUCKET = "my.metabase.com";
      process.env.AWS_REGION = "us-north-9";
      mockFetch.mockReset();
    });

    const mockVersionInfo = () =>
      mockFetch.mockResolvedValue({
        json: async () => ({
          latest: { version: "v0.61.0" },
          older: [{ version: "v0.60.3" }, { version: "v0.60.2" }],
          major_version_support: [
            { major: 60, released: "2026-04-01", lts: true, eol: "2027-06-01" },
            { major: 61, released: "2026-05-01", lts: false, eol: "2027-07-01" },
          ],
        }),
      } as Awaited<ReturnType<typeof fetch>>);

    it("fetches the OSS version-info.json and returns true for the latest active LTS", async () => {
      mockVersionInfo();

      const tagLts = await isLatestActiveLts("v0.60.3", "2026-06-04");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://my.metabase.com.s3.us-north-9.amazonaws.com/version-info.json",
      );
      expect(tagLts).toBe(true);
    });

    it("returns false for an LTS version that is not the latest release of its major", async () => {
      mockVersionInfo();

      expect(await isLatestActiveLts("v0.60.2", "2026-06-04")).toBe(false);
    });

    it("returns false for a supported non-LTS version", async () => {
      mockVersionInfo();

      expect(await isLatestActiveLts("v0.61.0", "2026-06-04")).toBe(false);
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
