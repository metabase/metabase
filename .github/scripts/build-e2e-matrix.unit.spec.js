const { buildMatrix } = require("./build-e2e-matrix");
const glob = require("glob");

describe("buildMatrix", () => {
  it("should calculate correct regular chunks with default parameters", () => {
    const result = buildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 30);

    expect(result.regularChunks).toBe(27);
  });

  it("should create correct number of configuration objects", () => {
    const result = buildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 10);

    expect(result.config.length).toBe(10);
  });

  it("should apply default specs path when null is provided", () => {
    const result = buildMatrix(null, 5);

    expect(result.regularChunks).toBe(2);
    expect(result.config.length).toBe(5);
  });

  it("should name regular test groups sequentially", () => {
    const result = buildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 10);
    const regularTests = result.config.filter((cfg) =>
      cfg.name.startsWith("e2e-group-"),
    );

    regularTests.forEach((test, index) => {
      expect(test.name).toBe(`e2e-group-${index + 1}`);
    });
  });

  it("should handle case when input chunks equals special tests count", () => {
    const result = buildMatrix("./e2e/test/scenarios/**/*.cy.spec.*", 3);

    expect(result.regularChunks).toBe(0);
    expect(result.config.length).toBe(3);
    expect(result.config[0].name).toBe("embedding-sdk");
    expect(result.config[1].name).toBe("oss-subset");
    expect(result.config[2].name).toBe("mongo");
  });

  it("should correctly calculate regularChunks for non-default spec pattern", () => {
    const originalSync = glob.sync;
    glob.sync = jest.fn().mockReturnValue(Array(12).fill("file.cy.spec.js"));

    const result = buildMatrix("./custom/path/**/*.cy.spec.*", 10);

    // For 12 matching specs with SPECS_PER_CHUNK=5, we expect ceil(12/5) = 3 chunks
    expect(result.regularChunks).toBe(3);
    expect(glob.sync).toHaveBeenCalledWith("./custom/path/**/*.cy.spec.*");

    glob.sync = originalSync;
  });
});
