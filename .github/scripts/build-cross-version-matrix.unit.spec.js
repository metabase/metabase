const { buildCrossVersionMatrix } = require("./build-cross-version-matrix");

describe("buildCrossVersionMatrix", () => {
  describe("supported versions", () => {
    it("should generate a pair of entries per supported major", () => {
      const result = buildCrossVersionMatrix([59, 58, 57]);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.59.x" },
          { source: "v1.59.x", target: "HEAD" },
          { source: "HEAD", target: "v1.58.x" },
          { source: "v1.58.x", target: "HEAD" },
          { source: "HEAD", target: "v1.57.x" },
          { source: "v1.57.x", target: "HEAD" },
        ],
      });
    });

    it("should follow the supported list rather than a fixed count", () => {
      expect(buildCrossVersionMatrix([59]).config).toHaveLength(2);
      expect(buildCrossVersionMatrix([61, 60, 59, 58, 57]).config).toHaveLength(
        10,
      );
    });

    it("should skip majors that have dropped out of support", () => {
      // v1.57.x is out of support, so nothing migrates to or from it.
      const result = buildCrossVersionMatrix([59, 58, 56]);
      const versions = result.config
        .filter((e) => e.source === "HEAD")
        .map((e) => e.target);

      expect(versions).toEqual(["v1.59.x", "v1.58.x", "v1.56.x"]);
      expect(JSON.stringify(result)).not.toContain("v1.57.x");
    });

    it("should use EE prefix (v1)", () => {
      const result = buildCrossVersionMatrix([50]);
      expect(result.config[0].target).toBe("v1.50.x");
      expect(result.config[1].source).toBe("v1.50.x");
    });

    it("should create pairs in both directions (upgrade and downgrade)", () => {
      const entries = buildCrossVersionMatrix([59, 58, 57]).config;

      // Check HEAD -> version (upgrade test)
      expect(entries.filter((e) => e.source === "HEAD")).toHaveLength(3);
      // Check version -> HEAD (downgrade test)
      expect(entries.filter((e) => e.target === "HEAD")).toHaveLength(3);
    });
  });

  describe("normalization", () => {
    it("should sort majors newest first regardless of input order", () => {
      const result = buildCrossVersionMatrix([57, 59, 58]);
      const versions = result.config
        .filter((e) => e.source === "HEAD")
        .map((e) => e.target);

      expect(versions).toEqual(["v1.59.x", "v1.58.x", "v1.57.x"]);
    });

    it("should not double up on a duplicated major", () => {
      // version-info.json's `major_version_support` is append-only, so a line
      // can show up more than once.
      const result = buildCrossVersionMatrix([59, 58, 59]);
      expect(result.config).toHaveLength(4);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.59.x" },
          { source: "v1.59.x", target: "HEAD" },
          { source: "HEAD", target: "v1.58.x" },
          { source: "v1.58.x", target: "HEAD" },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle version 1", () => {
      const result = buildCrossVersionMatrix([1]);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.1.x" },
          { source: "v1.1.x", target: "HEAD" },
        ],
      });
    });

    it("should handle high version numbers", () => {
      const result = buildCrossVersionMatrix([100, 99]);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.100.x" },
          { source: "v1.100.x", target: "HEAD" },
          { source: "HEAD", target: "v1.99.x" },
          { source: "v1.99.x", target: "HEAD" },
        ],
      });
    });
  });

  describe("error handling", () => {
    it("should throw for undefined supportedMajors", () => {
      expect(() => buildCrossVersionMatrix()).toThrow(
        "Invalid supportedMajors: undefined. Must be a non-empty array of positive integers.",
      );
    });

    it("should throw for an empty list", () => {
      // getSupportedMajors throws on its own when nothing is in support, so an
      // empty matrix here means something upstream went wrong — fail loudly
      // instead of silently testing no versions at all.
      expect(() => buildCrossVersionMatrix([])).toThrow(
        "Invalid supportedMajors: []. Must be a non-empty array of positive integers.",
      );
    });

    it("should throw for a non-array", () => {
      expect(() => buildCrossVersionMatrix(59)).toThrow(
        "Invalid supportedMajors: 59. Must be a non-empty array of positive integers.",
      );
    });

    it("should throw for a non-integer major", () => {
      expect(() => buildCrossVersionMatrix([59, 58.5])).toThrow(
        "Invalid major version: 58.5. Must be a positive integer.",
      );
    });

    it("should throw for a zero major", () => {
      expect(() => buildCrossVersionMatrix([59, 0])).toThrow(
        "Invalid major version: 0. Must be a positive integer.",
      );
    });

    it("should throw for a negative major", () => {
      expect(() => buildCrossVersionMatrix([-1])).toThrow(
        "Invalid major version: -1. Must be a positive integer.",
      );
    });

    it("should throw for a NaN major", () => {
      expect(() => buildCrossVersionMatrix([NaN])).toThrow(
        "Invalid major version: NaN. Must be a positive integer.",
      );
    });

    it("should throw for an undefined major", () => {
      expect(() => buildCrossVersionMatrix([59, undefined])).toThrow(
        "Invalid major version: undefined. Must be a positive integer.",
      );
    });

    it("should throw for a stringified major", () => {
      expect(() => buildCrossVersionMatrix(["59"])).toThrow(
        "Invalid major version: 59. Must be a positive integer.",
      );
    });
  });

  describe("matrix structure for GitHub Actions", () => {
    it("should return object with config array", () => {
      const result = buildCrossVersionMatrix([59, 58, 57]);
      expect(result).toHaveProperty("config");
      expect(Array.isArray(result.config)).toBe(true);
    });

    it("should produce valid JSON for GitHub Actions", () => {
      const result = buildCrossVersionMatrix([59, 58, 57]);
      const json = JSON.stringify(result);
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.config).toHaveLength(6);
      expect(parsed.config[0]).toEqual({
        source: "HEAD",
        target: "v1.59.x",
      });
    });

    it("should have consistent entry structure", () => {
      const result = buildCrossVersionMatrix([59, 58, 57, 56, 55]);

      result.config.forEach((entry) => {
        expect(entry).toHaveProperty("source");
        expect(entry).toHaveProperty("target");
        expect(typeof entry.source).toBe("string");
        expect(typeof entry.target).toBe("string");
        // Either source or target should be HEAD
        expect(entry.source === "HEAD" || entry.target === "HEAD").toBeTruthy();
      });
    });

    it("should interleave upgrade and downgrade tests", () => {
      const result = buildCrossVersionMatrix([59, 58]);

      expect(result.config[0]).toEqual({
        source: "HEAD",
        target: "v1.59.x",
      });
      expect(result.config[1]).toEqual({
        source: "v1.59.x",
        target: "HEAD",
      });
      expect(result.config[2]).toEqual({
        source: "HEAD",
        target: "v1.58.x",
      });
      expect(result.config[3]).toEqual({
        source: "v1.58.x",
        target: "HEAD",
      });
    });
  });
});
