import type { Tag } from "./types";
import {
  findNextPatchVersion,
  getBuildRequirements,
  getDotXVersion,
  getDotXs,
  getEnterpriseVersion,
  getExtraTagsForVersion,
  getGenericVersion,
  getLastReleaseFromTags,
  getMajorVersion,
  getMajorVersionNumberFromReleaseBranch,
  getMilestoneName,
  getMinorVersion,
  getNextMilestones,
  getOSSVersion,
  getReleaseBranch,
  getSdkVersionFromReleaseTagName,
  getVersionFromReleaseBranch,
  getVersionType,
  isEnterpriseVersion,
  isNewVersionFormat,
  isOldVersionFormat,
  isPreReleaseVersion,
  isSupportedPrereleaseIdentifier,
  isValidVersionString,
  versionSort,
} from "./version-helpers";

describe("version-helpers", () => {

  describe("isValidVersionString", () => {
    describe("should recognize valid version strings", () => {
      const validCases = [
        "v0.35.2.3",
        "v1.45.2.3",
        "v0.35.0-RC",
        "v1.25.0-RC",
        "v0.45.0-rc",
        "v1.45.0-RC",
        "v0.35.0-rc",
        "v1.45.0-beta",
        "v0.35.0-alpha",
        "v0.35.2",
        "v1.11.0",
        "v1.45.0",
        "v1.45.2",
        "v1.9.0",
        "v1.25.2.3-rc4", // legacy RC format
        "v0.11.0-RC7", // legacy RC format
        "v59.0",
        "v59.0.1",
        "v59.1",
        "v59.11.4",
        "v89.11.4",
        "v89.11.4-beta",
        "v59.0-agpl",
        "v59.0.1-agpl",
        "v59.1-agpl",
        "v59.11.4-agpl",
        "v89.11.4-agpl",
        "v89.11.4-agpl-beta",
      ];

      it.each(validCases)("%s", (input) => {
        expect(isValidVersionString(input)).toEqual(true);
      });
    });

    describe("should reject invalid version strings", () => {
      const invalidCases = [
        "v0",
        "0.1.1",
        "",
        "v",
        "v0",
        "v1",
        "v2",
        "v12345",
        "v0123",
        "v2.75.2.3",
        "v0.25.foo",
        "v0.25.2-mrc2",
        "v1.2.3.-rc4.56",
        "v0.12.0-test",
        "v0.12.0-migration",
        "v1.42.0-preview1",
        "v20150601-alpha",
        "v1.9", // require .0 for major releases
        "v59", // require .0 for major releases
        "v0.11",
        "v0.11-RC7",
        "v53.4", // major too low for new format
        "v0.59.4", // major too high for old format
        "v59.0.1.2",
        "v59.1-beta-agpl", // should be -agpl-beta
      ];

      it.each(invalidCases)("%s", (input) => {
        expect(isValidVersionString(input)).toEqual(false);
      });
    });

    it("should recognize RC versions as valid", () => {
      const cases = [
        "v0.35.0-RC",
        "v0.35.0-rc",
        "v1.45.0-beta",
        "v0.3.4-alpha",
      ];

      cases.forEach((input) => {
        expect(isValidVersionString(input)).toEqual(true);
      });
    });
  });

  describe("isOldVersionFormat", () => {
    it.each([
      ["v0.35.2.3", true],
      ["v1.35.2.3", true],
      ["v1.35.2.3-agpl", false],
      ["v0.35.2.3-agpl", false],
      ["v1.35.0", true],
      ["v0.55.0", true],
      ["v0.56.2.3", false],
      ["v1.56.2.3", false],
      ["v56.0", false],
      ["v56.1.2", false],
      ["v56.0-beta", false],
      ["v56.0.12-beta", false],
      ["v56.4.5", false],
      ["v56.4.5-agpl", false],
    ])("%s -> true", (input, expected) => {
      expect(isOldVersionFormat(input)).toEqual(expected);
    });
  });

  describe("isNewVersionFormat", () => {
    it.each([
      ["v0.35.2.3", false],
      ["v1.35.2.3", false],
      ["v1.35.2.3-agpl", false],
      ["v0.35.2.3-agpl", false],
      ["v1.35.0", false],
      ["v0.55.0", false],
      ["v0.56.2.3", false],
      ["v1.56.2.3", false],
      ["v56.0", true],
      ["v56.1.2", true],
      ["v56.0-beta", true],
      ["v56.0-agpl-beta", true],
      ["v56.0.12-agpl-beta", true],
      ["v56.0.12-agpl-beta", true],
      ["v56.4.5", true],
      ["v56.4.5-agpl", true],
    ])("%s -> true", (input, expected) => {
      expect(isNewVersionFormat(input)).toEqual(expected);
    });
  });

  describe("getOSSVersion", () => {
    describe("should transform a valid version string to an OSS version string", () => {
      it.each([
        ["v0.35.2.3", "v0.35.2.3"],
        ["v1.35.2.3", "v0.35.2.3"],
        ["v75.2.3", "v75.2.3-agpl"],
        ["v75.0", "v75.0-agpl"],
        ["v75.0.2", "v75.0.2-agpl"],
        ["v75.0.2-agpl", "v75.0.2-agpl"],
        ["v75.0.2-agpl-beta", "v75.0.2-agpl-beta"],
        ["v75.0.2-beta", "v75.0.2-agpl-beta"],
        ["v75.0-beta", "v75.0-agpl-beta"],
      ])("%s -> %s", (input, expected) => {
        expect(getOSSVersion(input)).toEqual(expected);
      });
    });

    it("should throw an error if the input is not a valid version string", () => {
      expect(() => getOSSVersion("123")).toThrow();
    });
  });

  describe("getEnterpriseVersion", () => {
    describe("should transform a valid version string to an enterprise version string", () => {
      it.each([
        ["v0.35.2.3", "v1.35.2.3"],
        ["v1.35.2.3", "v1.35.2.3"],
        ["v1.35.2.3-beta", "v1.35.2.3-beta"],
        ["v0.35.2.3-beta", "v1.35.2.3-beta"],
        ["v75.2.3", "v75.2.3"],
        ["v75.0.2-agpl", "v75.0.2"],
        ["v75.0.2-agpl-beta", "v75.0.2-beta"],
        ["v75.0-beta", "v75.0-beta"],
      ])("%s -> %s", (input, expected) => {
        expect(getEnterpriseVersion(input)).toEqual(expected);
      });
    });

    it("should throw an error if the input is not a valid version string", () => {
      expect(() => getEnterpriseVersion("123")).toThrow();
      expect(() => getEnterpriseVersion("v1.123")).toThrow();
      expect(() => getEnterpriseVersion("v123-agpl")).toThrow();
    });
  });

  describe("isEnterpriseVersion", () => {
    describe("should correctly identify enterprise version numbers", () => {
      const cases = [
        "v1.12.3",
        "v1.20.0",
        "v1.1.2.0",
        "v1.50.0",
        "v1.0.0-RC1",
        "v1.0.0-beta",
        "v75.0",
        "v75.1",
        "v75.1.3",
        "v75.0-beta",
        "v75.11.3-beta",
      ];

      it.each(cases)("%s", (input) => {
        expect(isEnterpriseVersion(input)).toEqual(true);
      });
    });

    describe("should correctly identify non-enterprise version numbers", () => {
      const cases = [
        "v0.12",
        "v0.1.0",
        "v0.1.2.0",
        "v0.50",
        "v0.54.2-beta",
        "v95.0-agpl",
        "v95.134-agpl",
        "v95.0-agpl-beta",
        "v95.0.221-agpl",
      ];

      it.each(cases)("%s", (input) => {
        expect(isEnterpriseVersion(input)).toEqual(false);
      });
    });

    it("should return false for invalid versions", () => {
      expect(isEnterpriseVersion("123")).toEqual(false);
      expect(isEnterpriseVersion("foo")).toEqual(false);
      expect(isEnterpriseVersion("v29.0-agpl")).toEqual(false);
      expect(isEnterpriseVersion("v89")).toEqual(false);
    });
  });

  describe("isPreReleaseVersion", () => {
    it("should correctly identify RC version numbers", () => {
      ["v0.35.0-RC", "v1.45.0-RC", "v0.35.2-rc", "v0.45.0-RC2"].forEach((input) => {
        expect(isPreReleaseVersion(input)).toEqual(true);
      });
    });

    it("should correctly identify alpha version numbers", () => {
      ["v0.35.0-alpha", "v1.45.0-alpha", "v0.35.2-alpha"].forEach(
        (input) => {
          expect(isPreReleaseVersion(input)).toEqual(true);
        },
      );
    });

    it("should correctly identify beta version numbers", () => {
      ["v0.35.0-beta", "v1.45.0-beta", "v0.35.2.1-beta", "v75.0-beta", "v75.0.1-beta", "v75.1.3-agpl-beta"].forEach((input) => {
        expect(isPreReleaseVersion(input)).toEqual(true);
      });
    });

    it("should correctly identify non-RC version numbers", () => {
      ["v0.35", "v1.2", "v75.2.3", "v75.22.344-agpl"].forEach((input) => {
        expect(isPreReleaseVersion(input)).toEqual(false);
      });
    });

    it("should return false for invalid versions", () => {
      ["123", "foo", "rc", "parc", "v9.9-rc2", "v34.1.2-agpl"].forEach((input) => {
        expect(isPreReleaseVersion(input)).toEqual(false);
      });
    });
  });

  describe.only("getVersionType", () => {
    const cases: [string, string][] = [
      ["v0.25.0", "major"],
      ["v1.25.0", "major"],
      ["v0.25.2", "minor"],
      ["v1.25.2.3", "patch"],
      ["v1.25.0.3", "patch"],
      ["v0.35.0-rc1", "major"],
      ["v1.35.0-RC2", "major"],
      ["v1.35.0-beta", "major"],
      ["v1.35.2-alpha", "minor"],
      ["v1.35.0.1-alpha", "patch"],
      ["v59.0", "major"],
      ["v59.0-beta", "major"],
      ["v59.1", "minor"],
      ["v59.1-beta", "minor"],
      ["v59.0.1", "patch"],
      ["v59.0.1-beta", "patch"],
      ["v59.3.33", "patch"],
      ["v59.0-agpl", "major"],
      ["v59.3-agpl", "minor"],
      ["v59.0.1-agpl", "patch"],
      ["v59.3.33-agpl", "patch"],
      ["v59.0.1-agpl-beta", "patch"],
    ];

    it.each(cases)("%s -> %s", (input, expected) => {
      expect(getVersionType(input)).toEqual(expected);
    });

    it("should throw an error for invalid versions", () => {
      expect(() => getVersionType("foo")).toThrow();
      expect(() => getVersionType("123")).toThrow();
      expect(() => getVersionType("v53.0.2")).toThrow();
      expect(() => getVersionType("v0.59.0.2")).toThrow();
    });
  });

  describe("getReleaseBranch", () => {
    const cases = [
      ["v0.35.0-RC1", "release-x.35.x"],
      ["v1.35.0-rc1", "release-x.35.x"],
      ["v0.35.0-rc99", "release-x.35.x"],
      ["v1.35.0", "release-x.35.x"],
      ["v0.35.0", "release-x.35.x"],
      ["v0.35.0.0", "release-x.35.x"],
      ["v0.35.2", "release-x.35.x"],
      ["v1.35.2.0", "release-x.35.x"],
      ["v1.35.2.3.4", "release-x.35.x"],
      ["v75.2.3", "release-x.75.x"],
      ["v75.2.3-agpl", "release-x.75.x"],
      ["v75.2.3-agpl-beta", "release-x.75.x"],
      ["v75.0-agpl", "release-x.75.x"],
      ["v75.0", "release-x.75.x"],
      ["v75.0-beta", "release-x.75.x"],
    ];

    it.each(cases)("%s -> %s", (input, expected) => {
      expect(getReleaseBranch(input)).toEqual(expected);
    });

    it("should throw an error for invalid versions", () => {
      expect(() => getReleaseBranch("foo")).toThrow();
      expect(() => getReleaseBranch("123")).toThrow();
    });
  });

  describe("getVersionFromReleaseBranch", () => {
    describe("should return the version from a valid release branch", () => {
      const cases: [string, string][] = [
        ["/refs/heads/release-x.35.x", "v0.35.0"],
        ["/refs/heads/release-x.75.x", "v75.0"],
        ["release-x.7.x", "v0.7.0"],
        ["abcrelease-x.12.x", "v0.12.0"],
        ["refs/heads/release-x.22.x", "v0.22.0"],
        ["release-x.99.x", "v99.0"],
        ["release-x.75.x", "v75.0"],
      ];

      it.each(cases)("%s -> %s", (input, expected) => {
        expect(getVersionFromReleaseBranch(input)).toEqual(expected);
      });
    });

    it("should throw an error for invalid release branches", () => {
      const cases = [
        "foo",
        "release-x.75",
        "release-x.75.0",
        "release-x.75.x-test",
        "refs/heads/release-x",
      ];
      cases.forEach((input) => {
        expect(() => getVersionFromReleaseBranch(input)).toThrow();
      });
    });
  });

  describe("getBuildRequirements", () => {
    it("should return the correct build requirements for provided ee version", () => {
      expect(getBuildRequirements("v1.47.2.1")).toEqual({
        node: 18,
        java: 11,
        platforms: "linux/amd64",
      });
    });

    it("should return the correct build requirements for provided oss version", () => {
      expect(getBuildRequirements("v0.47.2.1")).toEqual({
        node: 18,
        java: 11,
        platforms: "linux/amd64",
      });
    });

    it("should return the correct build requirements for a major version release", () => {
      expect(getBuildRequirements("v0.47.0")).toEqual({
        node: 18,
        java: 11,
        platforms: "linux/amd64",
      });
    });

    it("should return the correct build requirements for an RC release", () => {
      expect(getBuildRequirements("v0.47.0-RC7")).toEqual({
        node: 18,
        java: 11,
        platforms: "linux/amd64",
      });
    });

    it("should throw an error for invalid versions", () => {
      expect(() => getBuildRequirements("foo")).toThrow();
      expect(() => getBuildRequirements("v2.47.6")).toThrow();
    });

    it("should use the latest build requirements for a version that has not been released", () => {
      expect(getBuildRequirements("v99.0")).toEqual({
        node: 22,
        java: 21,
        platforms: "linux/amd64,linux/arm64",
      });
    });
  });

  describe("getNextMilestones", () => {
    describe("should get next versions for a major release", () => {
      const testCases: [string, string[]][] = [
        ["v0.35.0", ["v0.35.1", "v0.36.0"]],
        ["v0.29.0", ["v0.29.1", "v0.30.0"]],
        ["v59.0", ["v59.1", "v60.0"]],
      ];

      it.each(testCases)("%s -> %s", (input, expected) => {
        expect(getNextMilestones(input)).toEqual(expected);
      });
    });

    describe("should handle ee and oss versions", () => {
      const testCases: [string, string[]][] = [
        ["v0.35.1", ["v0.35.2"]],
        ["v1.35.1", ["v1.35.2"]],
        ["v59.1", ["v59.2"]],
        ["v59.1-agpl", ["v59.2"]],
      ];

      it.each(testCases)("%s -> %s", (input, expected) => {
        expect(getNextMilestones(input)).toEqual(expected);
      });
    });

    describe("should get next versions for a minor release", () => {
      const testCases: [string, string[]][] = [
        ["v0.35.1", ["v0.35.2"]],
        ["v0.35.10", ["v0.35.11"]], // handles multi-digit minor
        ["v0.39.99", ["v0.39.100"]],
        ["v59.2", ["v59.3"]],
        ["v59.99", ["v59.100"]],
      ];

      it.each(testCases)("%s -> %s", (input, expected) => {
        expect(getNextMilestones(input)).toEqual(expected);
      });
    });

    it("should not get next versions for a patch release", () => {
      const testCases: [string, string[]][] = [
        ["v0.35.1.1", []],
        ["v1.39.99.3", []],
        ["v75.2.3", []],
        ["v75.2.3-agpl", []],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextMilestones(input)).toEqual(expected);
      });
    });

    it("should not get next versions for an RC release", () => {
      const testCases: [string, string[]][] = [
        ["v0.35.0-RC2", []],
        ["v0.39.0-rc99", []],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextMilestones(input)).toEqual(expected);
      });
    });

    it("should throw an error for an invalid version string", () => {
      expect(() => getNextMilestones("foo")).toThrow();
      expect(() => getNextMilestones("v2.75")).toThrow();
      expect(() => getNextMilestones("v0.35-RC2")).toThrow();
      expect(() => getNextMilestones("v0.95.1")).toThrow();
      expect(() => getNextMilestones("v35.1")).toThrow();
    });
  });

  describe("getGenericVersion", () => {
    describe("should return the generic version for a valid OSS version string", () => {
      const testCases: [string, string][] = [
        ["v0.35.0", "35.0"],
        ["v0.35.1", "35.1"],
        ["v0.35.12", "35.12"],
        ["v0.39.99", "39.99"],
        ["v0.39.99.0", "39.99.0"],
        ["v75.0", "75.0"],
        ["v75.0-agpl", "75.0"],
        ["v75.0.2", "75.0.2"],
        ["v75.0.2-agpl", "75.0.2"],
        ["v75.2-beta", "75.2-beta"],
        ["v75.2-agpl-beta", "75.2-beta"],
        ["v75.2.2-beta", "75.2.2-beta"],
        ["v75.2.2-agpl-beta", "75.2.2-beta"],
      ];

      it.each(testCases)("%s -> %s", (input, expected) => {
        expect(getGenericVersion(input)).toEqual(expected);
      });
    });

    describe("should return the generic version for a valid EE version string", () => {
      const testCases: [string, string][] = [
        ["v1.35.0", "35.0"],
        ["v1.35.1", "35.1"],
        ["v1.35.12", "35.12"],
        ["v1.39.99", "39.99"],
        ["v1.39.99.0", "39.99.0"],
        ["v1.35.0-RC2", "35.0-RC2"],
        ["v1.39.0-rc99", "39.0-rc99"],
        ["v75.0", "75.0"],
        ["v75.4.2-beta", "75.4.2-beta"],
      ];

      it.each(testCases)("%s -> %s", (input, expected) => {
        expect(getGenericVersion(input)).toEqual(expected);
      });
    });
  });

  describe("getMilestoneName", () => {
    it.each([
      ["v0.50.0", "0.50"],
      ["v1.50.0", "0.50"],
      ["v1.50.0-rc1", "0.50"],
      ["v1.50.0-RC1", "0.50"],
      ["v1.50.0-beta", "0.50"],
      ["v1.50.0-alpha", "0.50"],
      ["v1.50.1.1-alpha", "0.50.1"],
      ["v0.50.1", "0.50.1"],
      ["v1.50.1", "0.50.1"],
      ["v75.0", "75.0"],
      ["v75.22", "75.22"],
      ["v75.22.8", "75.22"],
      ["v75.22.8-agpl", "75.22"],
      ["v75.22.8-beta", "75.22"],
      ["v75.22.8-beta", "75.22"],
      ["v75.0-agpl", "75.0"],
    ])("%s -> %s", (input, expected) => {
      expect(getMilestoneName(input)).toBe(expected);
    });
  });

  describe("getLastReleaseFromTags", () => {
    it("should return the latest release tag for minor versions", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.0" },
          { ref: "refs/tags/v0.12.2" },
          { ref: "refs/tags/v0.12.1" },
          { ref: "refs/tags/v0.12.x" },
          { ref: "refs/tags/v75.x" },
          { ref: "refs/tags/v75.11" },
          { ref: "refs/tags/v75.2" },
          { ref: "refs/tags/v75.2.x" },

        ] as Tag[],
      });
      expect(latest).toBe("v75.11");
    });

    it("should return the latest release tag for patch versions", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.0" },
          { ref: "refs/tags/v0.11.2" },
          { ref: "refs/tags/v0.12.2" },
          { ref: "refs/tags/v0.12.1" },
          { ref: "refs/tags/v0.12.2.0" },
          { ref: "refs/tags/v0.12.2.3" },
          { ref: "refs/tags/v0.12.2.2" },
          { ref: "refs/tags/v75.5.1" },
          { ref: "refs/tags/v74.2.9" },
          { ref: "refs/tags/v75.3.2" },
        ] as Tag[],
      });
      expect(latest).toBe("v75.5.1");
    });

    it("should ignore ee vs oss prefixes", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.2.3" },
          { ref: "refs/tags/v1.12.2.2" },
          { ref: "refs/tags/v75.2.2" },
          { ref: "refs/tags/v75.2.3-agpl" },
          { ref: "refs/tags/v75.2.1" },
        ] as Tag[],
      });
      expect(latest).toBe("v75.2.3-agpl");
    });

    it("should ignore patches when the ignorePatches flag is passed", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.0" },
          { ref: "refs/tags/v0.11.2" },
          { ref: "refs/tags/v0.12.2" },
          { ref: "refs/tags/v0.12.1" },
          { ref: "refs/tags/v0.12.2.1" },
          { ref: "refs/tags/v0.12.2.3" },
          { ref: "refs/tags/v0.12.3.2-beta" },
          { ref: "refs/tags/v75.2.3" },
          { ref: "refs/tags/v75.1" },
        ] as Tag[],
        ignorePatches: true,
      });
      expect(latest).toBe("v75.1");
    });

    it("should return the latest tag for major version", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.9" },
          { ref: "refs/tags/v0.12.8" },
          { ref: "refs/tags/v0.13.0" },
          { ref: "refs/tags/v74.0" },
          { ref: "refs/tags/v76.0" },
          { ref: "refs/tags/v75.99" },
        ] as Tag[],
      });
      expect(latest).toBe("v76.0");
    });

    it("should not ignore pre releases by default", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.0" },
          { ref: "refs/tags/v0.12.1" },
          { ref: "refs/tags/v0.12.2-RC99" },
          { ref: "refs/tags/v0.12.3-alpha" },
          { ref: "refs/tags/v0.12.4-beta" },
          { ref: "refs/tags/v74.0-beta" },
          { ref: "refs/tags/v73.9" },
          { ref: "refs/tags/v75.0-beta" },

        ] as Tag[],
      });
      expect(latest).toBe("v75.0-beta");
    });

    it("should ignore pre releases with a flag passeed", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.12.0" },
          { ref: "refs/tags/v0.12.1" },
          { ref: "refs/tags/v0.12.2-RC99" },
          { ref: "refs/tags/v0.12.3-alpha" },
          { ref: "refs/tags/v0.12.4-beta" },
          { ref: "refs/tags/v74.0" },
          { ref: "refs/tags/v75.0-beta" },
          { ref: "refs/tags/v76.0-beta" },

        ] as Tag[],
        ignorePreReleases: true,
      });
      expect(latest).toBe("v74.0");
    });

    it("should ignore .x releases", () => {
      const latest = getLastReleaseFromTags({
        tags: [
          { ref: "refs/tags/v0.11.x" },
          { ref: "refs/tags/v0.20.x-beta" },
          { ref: "refs/tags/v0.20.2.3.x" },
          { ref: "refs/tags/v0.12.0" },
          { ref: "refs/tags/v0.12.1" },
          { ref: "refs/tags/v0.12.2" },
          { ref: "refs/tags/v0.19.x" },
          { ref: "refs/tags/v75.x" },
          { ref: "refs/tags/v72.79" },
          { ref: "refs/tags/v75.79.x" },
        ] as Tag[],
      });
      expect(latest).toBe("v72.79");
    });
  });

  describe("verisonSort", () => {
    it("should sort major versions", () => {
      const diff1 = versionSort("v0.50.9", "v0.48.1");
      expect(diff1).toBeGreaterThan(0);

      const diff2 = versionSort("v0.40.9", "v0.50.1");
      expect(diff2).toBeLessThan(0);

      const diff3 = versionSort("v0.50.0", "v0.50.0");
      expect(diff3).toBe(0);
    });

    it("should sort minor versions", () => {
      const diff1 = versionSort("v0.48.10", "v0.48.1");
      expect(diff1).toBeGreaterThan(0);

      const diff2 = versionSort("v0.40.2", "v0.40.4");
      expect(diff2).toBeLessThan(0);

      const diff3 = versionSort("v0.50.11", "v0.50.11");
      expect(diff3).toBe(0);
    });

    it.each([
      [
        ["v0.50.9.2", "v0.50.9.1"],
        ["v0.50.9.1", "v0.50.9.2"],
      ],
      [
        ["v0.50.9.2", "v0.50.9.2"],
        ["v0.50.9.2", "v0.50.9.2"],
      ],
      [
        ["v0.50.9.1", "v0.50.9.2"],
        ["v0.50.9.1", "v0.50.9.2"],
      ],
      [
        ["v0.50.9.1", "v0.50.9.0"],
        ["v0.50.9.0", "v0.50.9.1"],
      ],
      [
        ["v0.50.9", "v0.50.9.0"],
        ["v0.50.9", "v0.50.9.0"],
      ],
      [
        ["v0.50.9.1", "v0.50.9"],
        ["v0.50.9", "v0.50.9.1"],
      ],
      [
        ["v0.50.9.3", "v0.50.1"],
        ["v0.50.1", "v0.50.9.3"],
      ],
      [
        ["v0.50.1.23", "v0.50.2"],
        ["v0.50.1.23", "v0.50.2"],
      ],
      [
        ["v0.51.0", "v0.50.22.99"],
        ["v0.50.22.99", "v0.51.0"],
      ],
      [
        ["v0.52.2.2", "v0.52.1"],
        ["v0.52.1", "v0.52.2.2"],
      ],
      [
        ["v0.52.2.23", "v0.52.2.13"],
        ["v0.52.2.13", "v0.52.2.23"],
      ],
    ])("%s sorts to %s", (input, expected) => {
      const sorted = input.sort(versionSort);
      expect(sorted).toEqual(expected);
    });

    it("should handle versions with or without Vs", () => {
      const diff1 = versionSort("v0.48.10", "v0.48.1");
      expect(diff1).toBeGreaterThan(0);

      const diff2 = versionSort("0.40.2", "v0.40.4");
      expect(diff2).toBeLessThan(0);

      const diff3 = versionSort("v0.50.11", "0.50.11");
      expect(diff3).toBe(0);

      const diff4 = versionSort("0.50.12", "0.50.11");
      expect(diff4).toBeGreaterThan(0);

      const diff5 = versionSort("75.2", "v75.4");
      expect(diff5).toBeLessThan(0);
    });

    it("should ignore the ee/oss prefix", () => {
      const diff1 = versionSort("v0.48.10", "v1.48.1");
      expect(diff1).toBeGreaterThan(0);

      const diff2 = versionSort("1.40.2", "v0.40.4");
      expect(diff2).toBeLessThan(0);

      const diff3 = versionSort("v0.50.11", "1.50.11");
      expect(diff3).toBe(0);

      const diff4 = versionSort("50.12", "1.50.11");
      expect(diff4).toBeGreaterThan(0);

      const diff5 = versionSort("v70.12-agpl", "v75.11");
      expect(diff5).toBeGreaterThan(0);
    });
  });

  describe("findNextPatchVersion", () => {
    it.each([
      ["v0.50.0", "v0.50.0.1"],
      ["v0.23.0", "v0.23.0.1"],
      ["v0.33.0.0", "v0.33.0.1"],
      ["v0.33.0.1", "v0.33.0.2"],
      ["v0.50.1", "v0.50.1.1"],
      ["v0.50.1.2", "v0.50.1.3"],
      ["v0.50.9.21", "v0.50.9.22"],
      ["v0.50.9.99", "v0.50.9.100"],
      ["v0.50.2-beta", "v0.50.2.1-beta"],
      ["v0.50.0-beta", "v0.50.0.1-beta"],
      ["v0.50.9.99-alpha", "v0.50.9.100-alpha"],
      ["v0.50.1.3-RC", "v0.50.1.4-RC"],
      ["v59.0", "v59.0.1"],
      ["v59.0-agpl", "v59.0.1-agpl"],
      ["v59.0-agpl-beta", "v59.0.1-agpl-beta"],
      ["v59.0-beta", "v59.0.1-beta"],
      ["v59.0-agpl", "v59.0.1-agpl"],
      ["v59.2.3-agpl", "v59.2.4-agpl"],
      ["v59.2.10", "v59.2.11"],
      ["v59.2.10-agpl", "v59.2.11-agpl"],
    ])("%s -> %s", (input, expected) => {
      expect(findNextPatchVersion(input)).toBe(expected);
    });

    it("should throw an error for invalid versions", () => {
      expect(() => findNextPatchVersion("foo")).toThrow();
      expect(() => findNextPatchVersion("v2.75")).toThrow();
      expect(() => findNextPatchVersion("v0.35.0-gamma")).toThrow();
      expect(() => findNextPatchVersion("v0.35")).toThrow();
      expect(() => findNextPatchVersion("v0.35.f")).toThrow();
      expect(() => findNextPatchVersion("v0.35.1.f")).toThrow();
      expect(() => findNextPatchVersion("v0.35.1.2.f")).toThrow();
    });
  });

  describe("getMajorVersionNumberFromReleaseBranch", () => {
    it("should resolve major version from a common release branch", () => {
      expect(getMajorVersionNumberFromReleaseBranch("release-x.51.x")).toEqual(
        "51",
      );
      expect(getMajorVersionNumberFromReleaseBranch("release-x.52.x")).toEqual(
        "52",
      );

      expect(() => getMajorVersionNumberFromReleaseBranch("master")).toThrow();
      expect(() =>
        getMajorVersionNumberFromReleaseBranch("my-local-dev-branch"),
      ).toThrow();
    });
  });

  describe("getSdkVersionFromReleaseTagName", () => {
    it("should resolve sdk package version from assigned release tag", () => {
      expect(getSdkVersionFromReleaseTagName("embedding-sdk-0.51.9")).toEqual(
        "0.51.9",
      );
      expect(
        getSdkVersionFromReleaseTagName("embedding-sdk-0.52.2-nightly"),
      ).toEqual("0.52.2-nightly");

      expect(() => getSdkVersionFromReleaseTagName("v0.51.5.1")).toThrow();
    });
  });

  describe("getDotXs", () => {
    it.each([
      ["v1.35.0", ["v1.35.x"]],
      ["v1.35.1", ["v1.35.x", "v1.35.1.x"]],
      ["v1.35.2", ["v1.35.x", "v1.35.2.x"]],
      ["v0.35.0", ["v0.35.x"]],
      ["v0.35.1", ["v0.35.x", "v0.35.1.x"]],
      ["v0.35.2", ["v0.35.x", "v0.35.2.x"]],
      ["v75.0", ["v75.x"]],
      ["v75.1", ["v75.x", "v75.1.x"]],
      ["v75.2", ["v75.x", "v75.2.x"]],
      ["v75.2.3", ["v75.x", "v75.2.x"]],
      ["v75.0.3", ["v75.x", "v75.0.x"]],
      ["v75.0-beta", ["v75.x"]],
      ["v75.0-agpl-beta", ["v75.x-agpl"]],
      ["v75.4.3-agpl", ["v75.x-agpl", "v75.4.x-agpl"]],
    ])("%s -> %s", (input, expected) => {
      expect(getDotXs(input)).toEqual(expected);
    });
  });

  describe("getDotXVersion", () => {
    it.each([
      ["v1.35.0", "v1.35.x"],
      ["v1.35.1", "v1.35.1.x"],
      ["v1.35.1.2", "v1.35.1.x"],
      ["v0.35.0", "v0.35.x"],
      ["v0.35.1", "v0.35.1.x"],
      ["v0.35.1.2", "v0.35.1.x"],
      ["v75.0", "v75.x"],
      ["v75.1", "v75.1.x"],
      ["v75.2", "v75.2.x"],
      ["v75.2.3", "v75.2.x"],
      ["v75.0-beta", "v75.x"],
      ["v75.0-agpl-beta", "v75.x-agpl"],
    ])("%s -> %s", (input, expected) => {
      expect(getDotXVersion(input)).toEqual(expected);
    });
  });

  describe("getExtraTagsForVersion", () => {
    it("should return the correct extra tags for a major version", () => {
      expect(getExtraTagsForVersion({ version: "v1.35.0" })).toEqual([
        "v0.35.x",
        "v1.35.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v0.35.0" })).toEqual([
        "v0.35.x",
        "v1.35.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v75.0" })).toEqual([
        "v75.x-agpl",
        "v75.x",
      ]);
    });

    it("should return the correct extra tags for a minor version", () => {
      expect(getExtraTagsForVersion({ version: "v1.35.1" })).toEqual([
        "v0.35.x",
        "v0.35.1.x",
        "v1.35.x",
        "v1.35.1.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v0.35.1" })).toEqual([
        "v0.35.x",
        "v0.35.1.x",
        "v1.35.x",
        "v1.35.1.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v75.1" })).toEqual([
        "v75.x-agpl",
        "v75.1.x-agpl",
        "v75.x",
        "v75.1.x",
      ]);
    });

    it("should return the correct extra tags for a patch version", () => {
      expect(getExtraTagsForVersion({ version: "v1.35.1.3" })).toEqual([
        "v0.35.x",
        "v0.35.1.x",
        "v1.35.x",
        "v1.35.1.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v0.35.1.3" })).toEqual([
        "v0.35.x",
        "v0.35.1.x",
        "v1.35.x",
        "v1.35.1.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v75.1.3" })).toEqual([
        "v75.x-agpl",
        "v75.1.x-agpl",
        "v75.x",
        "v75.1.x",
      ]);
    });

    it("should return the correct extra tags for a beta version", () => {
      expect(getExtraTagsForVersion({ version: "v1.35.0-beta" })).toEqual([
        "v0.35.x",
        "v1.35.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v1.35.1-beta" })).toEqual([
        "v0.35.x",
        "v0.35.1.x",
        "v1.35.x",
        "v1.35.1.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v0.35.1.2-beta" })).toEqual([
        "v0.35.x",
        "v0.35.1.x",
        "v1.35.x",
        "v1.35.1.x",
      ]);

      expect(getExtraTagsForVersion({ version: "v75.1.3-beta" })).toEqual([
        "v75.x-agpl",
        "v75.1.x-agpl",
        "v75.x",
        "v75.1.x",
      ]);
    });
  });

  describe("isSupportedPrereleaseIdentifier", () => {
    function createTags(versions: string[]): Tag[] {
      return versions.map(
        (tag) => ({ ref: `refs/tags/embedding-sdk-${tag}` }) as Tag,
      );
    }

    it("should ignore prerelease labels that are not `nightly` when passing refs", () => {
      const filteredTags = createTags([
        "0.55.0",
        "0.55.0-nightly",
        "0.55.0-rc1",
        "0.55.0-rc2",
        "0.55.0-beta",
        "0.55.0-alpha",
        "0.55.5-metabot",
        "59.5-beta",
        "59.5-alpha",
        "59.5-nightly",
        "59.5-agpl-nightly",
        "59.5-agpl-beta",
      ]).filter(isSupportedPrereleaseIdentifier);

      expect(filteredTags).toEqual(createTags([
        "0.55.0",
        "0.55.0-nightly",
        "59.5-nightly",
        "59.5-agpl-nightly"
      ]));
    });
  });

  describe("getMajorVersion", () => {
    it.each([
      ["v0.52.3", "52"],
      ["v1.52.0", "52"],
      ["v1.43.2.1", "43"],
      ["v1.55.2.1", "55"],
      ["v56.0", "56"],
      ["v56.1.2", "56"],
      ["v59.0-beta", "59"],
      ["v59.0-agpl", "59"],
      ["v59.0.3-agpl", "59"],
    ])("%s -> %s" , (input, expected) => {
      expect(getMajorVersion(input)).toBe(expected);
    })
  });

  describe("getMinorVersion", () => {
    it.each([
      ["v0.52.3", "3"],
      ["v1.52.0", "0"],
      ["v1.43.2.1", "2"],
      ["v56.0", "0"],
      ["v56.1.2", "1"],
      ["v59.0-beta", "0"],
      ["v59.0-agpl", "0"],
      ["v59.3.3-agpl", "3"],
      ["v59.0.3-agpl", "0"],
    ])("%s -> %s" , (input, expected) => {
      expect(getMinorVersion(input)).toBe(expected);
    })
  });
});
