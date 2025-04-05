const { buildMatrix } = require("./matrix-builder");
const { globSync } = require("node:fs");

jest.mock("node:fs", () => ({
  globSync: jest.fn(),
}));

describe("buildMatrix", () => {
  beforeEach(() => {
    globSync.mockReset();
  });

  it("should create default matrix with correct number of chunks", () => {
    globSync.mockImplementation((pattern) => {
      if (pattern.includes("embedding-sdk")) return ["embedding.cy.spec.js"];
      return ["file1.cy.spec.js", "file2.cy.spec.js"];
    });

    const result = buildMatrix({ chunks: 30 });

    expect(result.regularChunks).toBe(27); // 30 - 3 special tests (embedding-sdk + oss-subset + mongo)
    expect(result.matrix.include).toHaveLength(30);
  });

  it("should handle specific specs pattern", () => {
    const specificPattern = "./e2e/test/scenarios/specific/**/*.cy.spec.*";

    // Mock globSync to return different results for different patterns
    globSync.mockImplementation((pattern) => {
      if (pattern.includes("embedding-sdk")) return ["embedding.cy.spec.js"];
      if (pattern === specificPattern)
        return ["file1.cy.spec.js", "file2.cy.spec.js", "file3.cy.spec.js"];
      return [];
    });

    const result = buildMatrix({
      chunks: 30,
      specs: specificPattern,
    });

    // With 3 files and SPECS_PER_CHUNK = 5, we should have 1 regular chunk
    // Plus all 3 special tests since they use the same specs pattern
    expect(result.regularChunks).toBe(1);
    expect(result.matrix.include).toHaveLength(4);

    // Check that we have the regular chunk
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "e2e-group-1",
        specs: specificPattern,
      }),
    );

    // Check that we have all special tests
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "embedding-sdk",
        specs: "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*",
      }),
    );
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "oss-subset",
        edition: "oss",
        tags: "@OSS @smoke+-@EE",
        specs: specificPattern,
      }),
    );
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "mongo",
        tags: "@mongo",
        specs: specificPattern,
      }),
    );
  });

  it("should include special tests when matching specs exist", () => {
    // Mock globSync to return files for both embedding-sdk and default pattern
    globSync.mockImplementation((pattern) => {
      if (pattern.includes("embedding-sdk")) return ["embedding.cy.spec.js"];
      // Return files for the default pattern to ensure regular chunks are created
      return ["file1.cy.spec.js", "file2.cy.spec.js"];
    });

    const result = buildMatrix({ chunks: 30 });

    // Verify total matrix length (regular chunks + special tests)
    expect(result.matrix.include).toHaveLength(30);

    // Verify regular chunks (should not have specs property when using default pattern)
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "e2e-group-1",
      }),
    );

    // Verify all special tests
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "embedding-sdk",
        specs: "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*",
      }),
    );
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "oss-subset",
        edition: "oss",
        tags: "@OSS @smoke+-@EE",
        specs: "./e2e/test/scenarios/**/*.cy.spec.*",
      }),
    );
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "mongo",
        tags: "@mongo",
        specs: "./e2e/test/scenarios/**/*.cy.spec.*",
      }),
    );
  });

  it("should handle empty specs pattern", () => {
    // Mock globSync to return no files for any pattern
    globSync.mockImplementation(() => []);

    const result = buildMatrix({ chunks: 30 });

    // Should still create at least one chunk even with no files
    expect(result.regularChunks).toBe(1);
    expect(result.matrix.include).toHaveLength(1);
    expect(result.matrix.include[0]).toMatchObject({
      name: "e2e-group-1",
    });
  });

  it("should handle special tests with no matching files", () => {
    // Mock globSync to return files only for default pattern
    globSync.mockImplementation((pattern) => {
      if (pattern.includes("embedding-sdk")) return [];
      return ["file1.cy.spec.js", "file2.cy.spec.js"];
    });

    const result = buildMatrix({ chunks: 30 });

    // Should not include embedding-sdk since it has no matching files
    expect(result.matrix.include).not.toContainEqual(
      expect.objectContaining({
        name: "embedding-sdk",
      }),
    );

    // Should still include other special tests since they use default pattern
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "oss-subset",
      }),
    );
    expect(result.matrix.include).toContainEqual(
      expect.objectContaining({
        name: "mongo",
      }),
    );
  });

  it("should create multiple chunks when files exceed SPECS_PER_CHUNK", () => {
    const specificPattern = "./e2e/test/scenarios/specific/**/*.cy.spec.*";

    // Mock globSync to return 7 files for specific pattern and special tests
    globSync.mockImplementation((pattern) => {
      if (pattern === specificPattern) {
        return [
          "file1.cy.spec.js",
          "file2.cy.spec.js",
          "file3.cy.spec.js",
          "file4.cy.spec.js",
          "file5.cy.spec.js",
          "file6.cy.spec.js",
          "file7.cy.spec.js",
        ];
      }
      if (pattern.includes("embedding-sdk")) {
        return ["embedding.cy.spec.js"];
      }
      return [];
    });

    const result = buildMatrix({
      chunks: 30,
      specs: specificPattern,
    });

    // With 7 files and SPECS_PER_CHUNK = 5, we should have 2 regular chunks
    expect(result.regularChunks).toBe(2);
    expect(result.matrix.include).toHaveLength(3); // 2 regular chunks + embedding-sdk

    // Verify both regular chunks exist with correct properties
    expect(result.matrix.include).toContainEqual({
      name: "e2e-group-1",
      specs: specificPattern,
      "java-version": 21,
      runner: "ubuntu-22.04",
      edition: "ee",
    });

    expect(result.matrix.include).toContainEqual({
      name: "e2e-group-2",
      specs: specificPattern,
      "java-version": 21,
      runner: "ubuntu-22.04",
      edition: "ee",
    });

    // Verify embedding-sdk test is included
    expect(result.matrix.include).toContainEqual({
      name: "embedding-sdk",
      specs: "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*",
      "java-version": 21,
      runner: "ubuntu-22.04",
      edition: "ee",
    });
  });

  it("should handle exactly SPECS_PER_CHUNK files", () => {
    const specificPattern = "./e2e/test/scenarios/specific/**/*.cy.spec.*";

    globSync.mockImplementation((pattern) => {
      if (pattern.includes("embedding-sdk")) return ["embedding.cy.spec.js"];
      if (pattern === specificPattern)
        return [
          "file1.cy.spec.js",
          "file2.cy.spec.js",
          "file3.cy.spec.js",
          "file4.cy.spec.js",
          "file5.cy.spec.js",
        ];
      return [];
    });

    const result = buildMatrix({
      chunks: 30,
      specs: specificPattern,
    });

    // With exactly 5 files and SPECS_PER_CHUNK = 5, we should have 1 regular chunk
    expect(result.regularChunks).toBe(1);
    expect(result.matrix.include).toHaveLength(4); // 1 regular + 3 special
  });
});
