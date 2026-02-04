const { buildMatrix, getRelevantSpecs } = require("./build-e2e-matrix");

describe("buildMatrix", () => {
  const options = {
    java: "11",
    defaultRunner: "ubuntu-22.04",
  };
  const testBuildMatrix = (entry, chunks) =>
    buildMatrix(options, entry, chunks);

  it("should calculate correct regular chunks with default parameters", () => {
    const result = testBuildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 30);

    expect(result.regularChunks).toBe(27);
  });

  it("should create correct number of configuration objects", () => {
    const result = testBuildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 10);

    expect(result.config.length).toBe(10);
  });

  it("should apply default specs path when empty entry is provided", () => {
    const result = testBuildMatrix("", 6);

    expect(result.regularChunks).toBe(3);
    expect(result.config.length).toBe(6);
  });

  it("should name regular test groups sequentially", () => {
    const result = testBuildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 10);
    const regularTests = result.config.filter((cfg) =>
      cfg.name.startsWith("e2e-group-"),
    );

    regularTests.forEach((test, index) => {
      expect(test.name).toBe(`e2e-group-${index + 1}`);
    });
  });

  it("should handle case when input chunks equals special tests count", () => {
    const result = testBuildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 3);

    expect(result.regularChunks).toBe(0);
    expect(result.config.length).toBe(3);
    expect(result.config[0].name).toBe("oss-subset");
    expect(result.config[1].name).toBe("mongo");
    expect(result.config[2].name).toBe("python");
  });

  it("should correctly calculate regularChunks for non-default spec pattern", () => {
    const entry = "file.cy.spec.js,".repeat(12).slice(0, -1);
    const result = testBuildMatrix(entry, 10);

    // For 12 matching specs with SPECS_PER_CHUNK=5, we expect ceil(12/5) = 3 chunks
    expect(result.regularChunks).toBe(3);

    const firstGroupSpecs = result.config[0].specs.split(",").length;
    const secondGroupSpecs = result.config[1].specs.split(",").length;
    const thirdGroupSpecs = result.config[2].specs.split(",").length;

    expect(firstGroupSpecs).toBe(5);
    expect(secondGroupSpecs).toBe(5);
    expect(thirdGroupSpecs).toBe(2);
  });

  it("should return isDefaultSpecPattern as true when empty or default value is provided", () => {
    let result = testBuildMatrix("", 5);

    expect(result.isDefaultSpecPattern).toBe(true);

    result = testBuildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 5);

    expect(result.isDefaultSpecPattern).toBe(true);
  });

  it("should return isDefaultSpecPattern as false when non-default spec pattern is provided", () => {
    const result = testBuildMatrix("test1.cy.spec.js,test2.cy.spec.js", 1);

    expect(result.isDefaultSpecPattern).toBe(false);
  });

  it("should return special test configs when default spec pattern is provided", () => {
    const result = testBuildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 50);

    expect(result.config[47].name).toBe("oss-subset");
    expect(result.config[48].name).toBe("mongo");
    expect(result.config[49].name).toBe("python");
  });

  it("should not return special test configs when non-default spec pattern is provided", () => {
    const result = testBuildMatrix("test1.cy.spec.js,test2.cy.spec.js", 50);

    expect(result.config.length).toBe(1);
    expect(result.config[0].name).toBe("e2e-group-1");
  });

  describe("getRelevantSpecs", () => {
    it("should return correct spec folders for changed files", () => {
      const changedFiles = [
        "frontend/src/metabase/search/some-file.js",
        "src/metabase/internal_stats/stats.clj",
        "some/other/file.txt",
      ].join("\n");

      const matchedSpecs = getRelevantSpecs(changedFiles);

      console.log({ matchedSpecs });

      expect(matchedSpecs).toContain("search");
      expect(matchedSpecs).toContain("stats");
      expect(matchedSpecs).not.toContain("sharing");
    });
  });
});
