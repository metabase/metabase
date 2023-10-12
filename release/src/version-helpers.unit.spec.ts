import {
  isValidVersionString,
  getOSSVersion,
  getEnterpriseVersion,
  isEnterpriseVersion,
  isRCVersion,
  getVersionType,
  getReleaseBranch,
  isLatestVersion,
  getNextVersions,
} from "./version-helpers";

describe("version-helpers", () => {
  describe("isValidVersionString", () => {
    const validCases = [
      "v0.75.2.3",
      "v1.75.2.3",
      "v0.75.0-RC1",
      "v1.75.0-RC2",
      "v0.45.0-rc99",
      "v1.45.0-RC99",
      "v0.75.0-rc0",
      "v0.75.2",
      "v1.11.0",
      "v1.75.0",
      "v1.75.2",
      "v1.9.0",
    ];

    validCases.forEach(input => {
      it(`should recognize ${input} as valid`, () => {
        expect(isValidVersionString(input)).toEqual(true);
      });
    });

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
      "v0.25.2-rc",
      "v1.2.3.-rc4.56",
      "v0.12.0-test",
      "v0.12.0-migration",
      "v1.42.0-preview1",
      "v20150601-alpha",
      "v1.9", // require .0 for major releases
      "v0.11",
    ];

    invalidCases.forEach(input => {
      it(`should recognize ${input} as invalid`, () => {
        expect(isValidVersionString(input)).toEqual(false);
      });
    });

    it("should recognize RC versions as valid", () => {
      const cases = ["v0.75.0-RC1", "v1.75.0-RC2", "v0.3.4-rc3"];

      cases.forEach(input => {
        expect(isValidVersionString(input)).toEqual(true);
      });
    });
  });

  describe("getOSSVersion", () => {
    it("should transform a valid version string to an OSS version string", () => {
      expect(getOSSVersion("v0.75.2.3")).toEqual("v0.75.2.3");
      expect(getOSSVersion("v1.75.2.3")).toEqual("v0.75.2.3");
    });

    it("should throw an error if the input is not a valid version string", () => {
      expect(() => getOSSVersion("123")).toThrow();
    });
  });

  describe("getEnterpriseVersion", () => {
    it("should transform a valid version string to an OSS version string", () => {
      expect(getEnterpriseVersion("v0.75.2.3")).toEqual("v1.75.2.3");
      expect(getEnterpriseVersion("v1.75.2.3")).toEqual("v1.75.2.3");
    });

    it("should throw an error if the input is not a valid version string", () => {
      expect(() => getEnterpriseVersion("123")).toThrow();
    });
  });

  describe("isEnterpriseVersion", () => {
    it("should correctly identify enterprise version numbers", () => {
      const cases: [string, boolean][] = [
        ["v1.0", true],
        ["v1.0.0", true],
        ["v1.1.2.0", true],
        ["v1.50", true],
        ["v1.0.0-RC1", true],
      ];

      cases.forEach(([input, expected]) => {
        expect(isEnterpriseVersion(input)).toEqual(expected);
      });
    });

    it("should correctly identify non-enterprise version numbers", () => {
      const cases = ["v0.12", "v0.1.0", "v0.1.2.0", "v0.50"];

      cases.forEach(input => {
        expect(isEnterpriseVersion(input)).toEqual(false);
      });
    });

    it("should return false for invalid versions", () => {
      expect(isEnterpriseVersion("123")).toEqual(false);
      expect(isEnterpriseVersion("foo")).toEqual(false);
    });
  });

  describe("isRCVersion", () => {
    it("should correctly identify RC version numbers", () => {
      ["v0.75.0-RC1", "v1.75.0-RC2", "v0.75.2.9.7-rc3"].forEach(input => {
        expect(isRCVersion(input)).toEqual(true);
      });
    });

    it("should correctly identify non-RC version numbers", () => {
      ["v0.75", "v1.2"].forEach(input => {
        expect(isRCVersion(input)).toEqual(false);
      });
    });

    it("should return false for invalid versions", () => {
      ["123", "foo", "rc", "parc", "v9.9-rc2"].forEach(input => {
        expect(isRCVersion(input)).toEqual(false);
      });
    });
  });

  describe("getVersionType", () => {
    const cases: [string, string][] = [
      ["v0.25.0", "major"],
      ["v1.25.0", "major"],
      ["v0.25.2", "minor"],
      ["v1.25.2.3", "patch"],
      ["v1.25.0.3", "patch"],
      ["v0.75.0-rc1", "rc"],
      ["v1.75.0-RC2", "rc"],
    ];

    cases.forEach(([input, expected]) => {
      it(`should return ${expected} for ${input}`, () => {
        expect(getVersionType(input)).toEqual(expected);
      });
    });

    it("should throw an error for invalid versions", () => {
      expect(() => getVersionType("foo")).toThrow();
      expect(() => getVersionType("123")).toThrow();
    });
  });

  describe("getReleaseBranch", () => {
    const cases = [
      "v0.75.0-RC1",
      "v1.75.0-rc1",
      "v0.75.0-rc99",
      "v1.75.0",
      "v0.75.0",
      "v0.75.0.0",
      "v0.75.2",
      "v1.75.2.0",
      "v1.75.2.3.4",
    ];

    cases.forEach(input => {
      it(`should return release-x.75.x for ${input}`, () => {
        expect(getReleaseBranch(input)).toEqual(`release-x.75.x`);
      });
    });

    it("should throw an error for invalid versions", () => {
      expect(() => getReleaseBranch("foo")).toThrow();
      expect(() => getReleaseBranch("123")).toThrow();
    });
  });

  describe("isLatestVersion", () => {
    it(`should return true for latest releases`, () => {
      const cases: [string, string[]][] = [
        ["v0.25.2.1", ["v0.24.0", "v0.25.1", "v0.25.2", "v0.9.0"]],
        ["v0.25.3", ["v0.24.0", "v0.25.1", "v0.25.2"]],
        ["v0.26.0", ["v0.24.0", "v0.25.1", "v0.25.2"]],
        ["v0.26.0", ["v0.24.0", "v0.25.1", "v0.25.2"]],
      ];
      cases.forEach(([input, releases]) => {
        expect(isLatestVersion(input, releases)).toEqual(true);
        expect(isLatestVersion(input, releases.reverse())).toEqual(true);
      });
    });

    it(`should return false for non-latest releases`, () => {
      const cases: [string, string[]][] = [
        ["v0.21.2.1", ["v0.24.0", "v0.25.1", "v0.25.2", "v0.9.9.9"]],
        ["v0.25.1.2", ["v0.24.0", "v0.25.1", "v0.25.2", "v0.9.9.9"]],
        ["v0.25.0", ["v0.24.0", "v0.25.1", "v0.25.2", "v0.9.0"]],
        ["v0.25.1.99", ["v0.24.0", "v0.25.1", "v0.25.2", "v0.9.0"]],
        ["v0.71", ["v0.24", "v0.25.1", "v0.25.2", "v0.80.0"]],
      ];
      cases.forEach(([input, releases]) => {
        expect(isLatestVersion(input, releases),).toEqual(false);
        expect(isLatestVersion(input, releases.reverse())).toEqual(false);
      });
    });

    it("should ignore EE vs OSS version", () => {
      const falseCases: [string, string[]][] = [
        ["v0.21.2.1", ["v1.24", "v1.25.1", "v0.25.2"]],
        ["v1.25.1.2", ["v0.24", "v1.25.1", "v0.25.2"]],
        ["v0.25", ["v1.24", "v0.25.1", "v1.25.2"]],
        ["v1.25.1.99", ["v0.24", "v0.25.1", "v1.25.2"]],
      ];

      falseCases.forEach(([input, releases]) => {
        expect(isLatestVersion(input, releases)).toEqual(false);
        expect(isLatestVersion(input, releases.reverse())).toEqual(false);
      });

      const trueCases: [string, string[]][] = [
        ["v0.25.2.1", ["v0.24", "v0.25.1", "v0.25.2"]],
        ["v0.25.3", ["v0.24", "v0.25.1", "v0.25.2"]],
        ["v0.26", ["v0.24", "v0.25.1", "v0.25.2"]],
        ["v0.26.0", ["v0.24", "v0.25.1", "v0.25.2"]],
      ];

      trueCases.forEach(([input, releases]) => {
        expect(isLatestVersion(input, releases)).toEqual(true);
        expect(isLatestVersion(input, releases.reverse())).toEqual(true);
      });
    });

    it("should return true for an equal release", () => {
      expect(isLatestVersion("v0.25.2", ["v0.25.2", "v0.25.1"])).toEqual(true);
    });

    it("should filter out invalid versions", () => {
      const trueCases: [string, string[]][] = [
        ["v0.25.2.1", ["v0.24", "v0.25.1", "99"]],
        ["v0.25.3", ["v0.24", "v0.25.1", "xyz"]],
        ["v0.26", ["v0.24", "v0.25.1", "v99.99.99"]],
        ["v0.26.0", ["-1", "000", ""]],
      ];

      trueCases.forEach(([input, releases]) => {
        expect(isLatestVersion(input, releases)).toEqual(true);
        expect(isLatestVersion(input, releases.reverse())).toEqual(true);
      });
    });

    it("should never mark an RC as latest", () => {
      const cases: [string, string[]][] = [
        ["v0.25.2.1-rc1", ["v0.24.0", "v0.25.1", "v0.25.2-rc1"]],
        ["v0.25.3-rc2", ["v0.24.0", "v0.25.1", "v0.25.2-rc2"]],
        ["v0.26.0-RC2", ["v0.24.0", "v0.25.1", "v0.25.2-rc3"]],
        ["v0.24.5-rc1", ["v0.24.0", "v0.25.1", "v0.25.2-rc4"]],
        ["v0.26.0-rc99", ["v0.24.0", "v0.25.1", "v0.25.2-rc4"]],
        ["v0.99.0-rc99", ["v0.24.0", "v0.25.1", "v0.99-rc4", "v0.9.9.9"]],
      ];

      cases.forEach(([input, releases]) => {
        expect(isLatestVersion(input, releases)).toEqual(false);
        expect(isLatestVersion(input, releases.reverse())).toEqual(false);
      });
    });
  });

  describe('getNextVersions', () => {
    it('should get next versions for a major release', () => {
      const testCases: [string, string[]][] = [
        ['v0.75.0', ['v0.75.1', 'v0.76.0']],
        ['v0.99.0', ['v0.99.1', 'v0.100.0']],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextVersions(input)).toEqual(expected);
      });
    });

    it('should handle ee and oss versions', () => {
      const testCases: [string, string[]][] = [
        ['v0.75.1', ['v0.75.2']],
        ['v1.75.1', ['v1.75.2']],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextVersions(input)).toEqual(expected);
      });
    });

    it('should get next versions for a minor release', () => {
      const testCases: [string, string[]][] = [
        ['v0.75.1', ['v0.75.2']],
        ['v0.75.1.0', ['v0.75.2']], // disregards extra .0
        ['v0.79.99', ['v0.79.100']],
        ['v0.79.99.0', ['v0.79.100']],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextVersions(input)).toEqual(expected);
      });
    });

    it('should not get next versions for a patch release', () => {
      const testCases: [string, string[]][] = [
        ['v0.75.1.1', []],
        ['v0.79.99.3', []],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextVersions(input)).toEqual(expected);
      });
    });

    it('should not get next versions for an RC release', () => {
      const testCases: [string, string[]][] = [
        ['v0.75.0-RC2', []],
        ['v0.79.0-rc99', []],
      ];

      testCases.forEach(([input, expected]) => {
        expect(getNextVersions(input)).toEqual(expected);
      });
    });

    it('should throw an error for an invalid version string', () => {
      expect(() => getNextVersions('foo')).toThrow();
      expect(() => getNextVersions('v2.75')).toThrow();
      expect(() => getNextVersions('v0.75-RC2')).toThrow();
    });
  })
});
