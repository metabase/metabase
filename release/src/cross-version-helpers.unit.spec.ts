import {
  compareVersions,
  getDockerImage,
  getMajorVersion,
} from "./cross-version-helpers";

describe("cross-version-helpers", () => {
  describe("getMajorVersion", () => {
    it.each([
      ["v0.52.3", "52"],
      ["v1.52", "52"],
      ["v1.43.2.1", "43"],
      // Rolling tags
      ["v1.59.x", "59"],
      ["v0.58.x", "58"],
    ])("%s -> %s", (input, expected) => {
      expect(getMajorVersion(input)).toBe(expected);
    });

    it("should handle HEAD when CURRENT_VERSION is set", () => {
      const originalEnv = process.env.CURRENT_VERSION;
      process.env.CURRENT_VERSION = "59";
      try {
        expect(getMajorVersion("HEAD")).toBe("60");
      } finally {
        process.env.CURRENT_VERSION = originalEnv;
      }
    });

    it("should throw for HEAD when CURRENT_VERSION is not set", () => {
      const originalEnv = process.env.CURRENT_VERSION;
      delete process.env.CURRENT_VERSION;
      try {
        expect(() => getMajorVersion("HEAD")).toThrow(
          "CURRENT_VERSION env var must be set when using HEAD",
        );
      } finally {
        process.env.CURRENT_VERSION = originalEnv;
      }
    });
  });

  describe("compareVersions", () => {
    it.each([
      // major version changes
      ["v0.50.0", "v0.51.0", "upgrade"],
      ["v0.57.13", "v0.58.7", "upgrade"],
      ["v0.51.0", "v0.50.0", "downgrade"],
      ["v0.58.7", "v0.57.13", "downgrade"],
      // minor version changes
      ["v0.58.6", "v0.58.7", "upgrade"],
      ["v0.58.7", "v0.58.6", "downgrade"],
      // patch version changes
      ["v0.50.13.5", "v0.50.13.6", "upgrade"],
      ["v0.50.13.6", "v0.50.13.5", "downgrade"],
      ["v0.50.13.5", "v0.50.13.5", "same"],
      // patch to minor
      ["v0.50.13.5", "v0.50.14", "upgrade"],
      ["v0.50.14", "v0.50.13.5", "downgrade"],
      // patch to major
      ["v0.50.13.5", "v0.51.0", "upgrade"],
      ["v0.51.0", "v0.50.13.5", "downgrade"],
      // same versions
      ["v0.50.0", "v0.50.0", "same"],
      ["v0.58.7", "v0.58.7", "same"],
      // ignores edition prefix (v0 vs v1)
      ["v1.58.6", "v0.58.7", "upgrade"],
      ["v0.58.7", "v1.58.6", "downgrade"],
      // HEAD (always newer than any released version)
      ["HEAD", "HEAD", "same"],
      ["HEAD", "v0.59.0", "downgrade"],
      ["HEAD", "v1.59.0", "downgrade"],
      ["v0.59.0", "HEAD", "upgrade"],
      ["v1.59.0", "HEAD", "upgrade"],
      // Rolling tags (.x)
      ["v1.58.x", "v1.59.x", "upgrade"],
      ["v1.59.x", "v1.58.x", "downgrade"],
      ["v1.59.x", "v1.59.x", "same"],
      ["v0.58.x", "v0.59.x", "upgrade"],
      // Mixed rolling and specific
      ["v1.58.x", "v1.59.0", "upgrade"],
      ["v1.59.0", "v1.58.x", "downgrade"],
    ] as const)("%s -> %s = %s", (source, target, expected) => {
      expect(compareVersions(source, target)).toBe(expected);
    });

    it("should throw for invalid source version", () => {
      expect(() => compareVersions("invalid", "v0.58.7")).toThrow(
        "Invalid version string: invalid",
      );
    });

    it("should throw for invalid target version", () => {
      expect(() => compareVersions("v0.58.7", "invalid")).toThrow(
        "Invalid version string: invalid",
      );
    });
  });

  describe("getDockerImage", () => {
    it.each([
      // OSS versions (v0.x.x)
      ["v0.58.7", "metabase/metabase:v0.58.7"],
      ["v0.57.13", "metabase/metabase:v0.57.13"],
      ["v0.50.13.5", "metabase/metabase:v0.50.13.5"], // patch version
      // EE versions (v1.x.x)
      ["v1.58.7", "metabase/metabase-enterprise:v1.58.7"],
      ["v1.57.13", "metabase/metabase-enterprise:v1.57.13"],
      ["v1.50.13.5", "metabase/metabase-enterprise:v1.50.13.5"], // patch version
      // Rolling tags (.x)
      ["v0.59.x", "metabase/metabase:v0.59.x"],
      ["v1.59.x", "metabase/metabase-enterprise:v1.59.x"],
      ["v0.50.x", "metabase/metabase:v0.50.x"],
      ["v1.50.x", "metabase/metabase-enterprise:v1.50.x"],
    ] as const)("%s -> %s", (version, expected) => {
      expect(getDockerImage(version)).toBe(expected);
    });

    it("should throw for invalid version", () => {
      expect(() => getDockerImage("invalid")).toThrow(
        "Invalid version string: invalid",
      );
    });

    it("should return enterprise HEAD image for HEAD", () => {
      expect(getDockerImage("HEAD")).toBe(
        "metabase/metabase-enterprise-head:latest",
      );
    });
  });
});
