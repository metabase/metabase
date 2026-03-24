const { buildCrossVersionMatrix } = require("./build-cross-version-matrix");

describe("buildCrossVersionMatrix", () => {
  describe("default behavior", () => {
    it("should generate matrix with 3 versions by default", () => {
      const result = buildCrossVersionMatrix(59);
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

    it("should use EE prefix (v1)", () => {
      const result = buildCrossVersionMatrix(50);
      expect(result.config[0].target).toBe("v1.50.x");
      expect(result.config[1].source).toBe("v1.50.x");
    });

    it("should create pairs in both directions (upgrade and downgrade)", () => {
      const result = buildCrossVersionMatrix(59);
      const entries = result.config;

      // Check HEAD -> version (upgrade test)
      expect(entries.filter((e) => e.source === "HEAD")).toHaveLength(3);
      // Check version -> HEAD (downgrade test)
      expect(entries.filter((e) => e.target === "HEAD")).toHaveLength(3);
    });
  });

  describe("custom count", () => {
    it("should generate matrix with custom count", () => {
      const result = buildCrossVersionMatrix(59, 5);
      expect(result.config).toHaveLength(10); // 5 versions × 2 directions
      expect(result.config).toEqual([
        { source: "HEAD", target: "v1.59.x" },
        { source: "v1.59.x", target: "HEAD" },
        { source: "HEAD", target: "v1.58.x" },
        { source: "v1.58.x", target: "HEAD" },
        { source: "HEAD", target: "v1.57.x" },
        { source: "v1.57.x", target: "HEAD" },
        { source: "HEAD", target: "v1.56.x" },
        { source: "v1.56.x", target: "HEAD" },
        { source: "HEAD", target: "v1.55.x" },
        { source: "v1.55.x", target: "HEAD" },
      ]);
    });

    it("should generate matrix with count=1", () => {
      const result = buildCrossVersionMatrix(59, 1);
      expect(result.config).toHaveLength(2);
      expect(result.config).toEqual([
        { source: "HEAD", target: "v1.59.x" },
        { source: "v1.59.x", target: "HEAD" },
      ]);
    });

    it("should generate matrix with large count", () => {
      const result = buildCrossVersionMatrix(59, 10);
      expect(result.config).toHaveLength(20);

      // Check first and last entries
      expect(result.config[0]).toEqual({
        source: "HEAD",
        target: "v1.59.x",
      });
      expect(result.config[18]).toEqual({
        source: "HEAD",
        target: "v1.50.x",
      });
      expect(result.config[19]).toEqual({
        source: "v1.50.x",
        target: "HEAD",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle version 1", () => {
      const result = buildCrossVersionMatrix(1);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.1.x" },
          { source: "v1.1.x", target: "HEAD" },
        ],
      });
    });

    it("should stop when version would go below 1", () => {
      const result = buildCrossVersionMatrix(2, 5);
      // Can only generate v1.2.x and v1.1.x (2 versions, not 5)
      expect(result.config).toHaveLength(4);
      expect(result).toEqual({
        config: [
          { source: "HEAD", target: "v1.2.x" },
          { source: "v1.2.x", target: "HEAD" },
          { source: "HEAD", target: "v1.1.x" },
          { source: "v1.1.x", target: "HEAD" },
        ],
      });
    });

    it("should handle high version numbers", () => {
      const result = buildCrossVersionMatrix(100, 2);
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
    it("should throw for undefined currentVersion", () => {
      expect(() => buildCrossVersionMatrix()).toThrow(
        "Invalid currentVersion: undefined. Must be a positive integer.",
      );
    });

    it("should throw for non-integer currentVersion", () => {
      expect(() => buildCrossVersionMatrix(59.5)).toThrow(
        "Invalid currentVersion: 59.5. Must be a positive integer.",
      );
    });

    it("should throw for zero currentVersion", () => {
      expect(() => buildCrossVersionMatrix(0)).toThrow(
        "Invalid currentVersion: 0. Must be a positive integer.",
      );
    });

    it("should throw for negative currentVersion", () => {
      expect(() => buildCrossVersionMatrix(-1)).toThrow(
        "Invalid currentVersion: -1. Must be a positive integer.",
      );
    });

    it("should throw for NaN currentVersion", () => {
      expect(() => buildCrossVersionMatrix(NaN)).toThrow(
        "Invalid currentVersion: NaN. Must be a positive integer.",
      );
    });

    it("should throw for non-integer count", () => {
      expect(() => buildCrossVersionMatrix(59, 2.5)).toThrow(
        "Invalid count: 2.5. Must be a positive integer.",
      );
    });

    it("should throw for zero count", () => {
      expect(() => buildCrossVersionMatrix(59, 0)).toThrow(
        "Invalid count: 0. Must be a positive integer.",
      );
    });

    it("should throw for negative count", () => {
      expect(() => buildCrossVersionMatrix(59, -1)).toThrow(
        "Invalid count: -1. Must be a positive integer.",
      );
    });
  });

  describe("matrix structure for GitHub Actions", () => {
    it("should return object with config array", () => {
      const result = buildCrossVersionMatrix(59);
      expect(result).toHaveProperty("config");
      expect(Array.isArray(result.config)).toBe(true);
    });

    it("should produce valid JSON for GitHub Actions", () => {
      const result = buildCrossVersionMatrix(59);
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
      const result = buildCrossVersionMatrix(59, 5);

      result.config.forEach((entry) => {
        expect(entry).toHaveProperty("source");
        expect(entry).toHaveProperty("target");
        expect(typeof entry.source).toBe("string");
        expect(typeof entry.target).toBe("string");
        // Either source or target should be HEAD
        expect(entry.source === "HEAD" || entry.target === "HEAD").toBeTruthy();
      });
    });
  });

  describe("version ordering", () => {
    it("should generate versions in descending order", () => {
      const result = buildCrossVersionMatrix(59, 5);
      const versions = result.config
        .filter((e) => e.source === "HEAD")
        .map((e) => e.target);

      expect(versions).toEqual([
        "v1.59.x",
        "v1.58.x",
        "v1.57.x",
        "v1.56.x",
        "v1.55.x",
      ]);
    });

    it("should interleave upgrade and downgrade tests", () => {
      const result = buildCrossVersionMatrix(59, 2);

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
