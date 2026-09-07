const { buildMatrix } = require("./build-e2e-matrix");

const options = { java: 25, defaultRunner: "runner" };
const specs = (count) =>
  Array.from({ length: count }, (_, i) => `e2e/test/scenarios/${i}.cy.spec.ts`);

describe("buildMatrix", () => {
  it.each([0, 3, 3.5])("should reject an invalid job budget: %s", (chunks) => {
    expect(() => buildMatrix(options, specs(1), chunks)).toThrow();
  });

  it("should use the full job budget when there is no plan", () => {
    const result = buildMatrix(options, null, 50);

    expect(result.regularChunks).toBe(47);
    expect(result.config).toHaveLength(50);
    expect(result.config[0]).toMatchObject({
      name: "e2e-group-01",
      edition: "ee",
      runner: "runner",
    });
    expect(result.config[46].name).toBe("e2e-group-47");
  });

  it("should create no jobs for an empty plan", () => {
    expect(buildMatrix(options, [], 50)).toEqual({
      config: [],
      regularChunks: 0,
    });
  });

  it.each([
    [1, 1],
    [5, 1],
    [6, 2],
    [12, 3],
    [424, 47],
  ])(
    "should allocate %i selected specs to %i regular jobs",
    (count, regularChunks) => {
      const result = buildMatrix(options, specs(count), 50);

      expect(result.regularChunks).toBe(regularChunks);
      expect(result.config).toHaveLength(regularChunks + 3);
    },
  );

  it.each([null, specs(1), specs(424)])(
    "should retain every tagged variant",
    (plan) => {
      const result = buildMatrix(options, plan, 50);

      expect(result.config.slice(-3)).toMatchObject([
        { name: "oss-subset", edition: "oss", tags: "@OSS @prerelease+-@EE" },
        { name: "mongo", edition: "ee", tags: "@mongo" },
        { name: "python", edition: "ee", tags: "@python" },
      ]);
    },
  );

  it("should leave regular jobs to cypress-split", () => {
    const result = buildMatrix(options, specs(12), 50);

    const regularJobs = result.config.slice(0, result.regularChunks);
    expect(regularJobs.map((job) => job.name)).toEqual([
      "e2e-group-01",
      "e2e-group-02",
      "e2e-group-03",
    ]);
    for (const job of regularJobs) {
      expect(job.specs).toBeUndefined();
    }
  });

  it("should keep the matrix small for a large plan", () => {
    const result = buildMatrix(options, specs(10000), 50);

    expect(result.config).toHaveLength(50);
    expect(JSON.stringify(result.config).length).toBeLessThan(10000);
    expect(JSON.stringify(result.config)).not.toContain("9999.cy.spec.ts");
  });
});
