const { buildMatrix } = require("./build-e2e-matrix");

const MINUTE_MS = 60_000;

const specs = (count) =>
  Array.from({ length: count }, (_, i) => `e2e/test/scenarios/${i}.cy.spec.ts`);

// Gives every spec from specs(count) the same duration, in the timings.json path format.
const timingsFor = (count, minutesPerSpec) => ({
  durations: Array.from({ length: count }, (_, i) => ({
    spec: `../test/scenarios/${i}.cy.spec.ts`,
    duration: minutesPerSpec * MINUTE_MS,
  })),
});

const setup = ({
  specFiles = null,
  maxJobs = 50,
  timings = timingsFor(500, 1),
  targetRunnerMinutes = 8,
} = {}) =>
  buildMatrix({
    java: 25,
    defaultRunner: "runner",
    specFiles,
    maxJobs,
    timings,
    targetRunnerMinutes,
  });

describe("buildMatrix", () => {
  it.each([0, 3, 3.5])("should reject an invalid job budget: %s", (maxJobs) => {
    expect(() => setup({ specFiles: specs(1), maxJobs })).toThrow();
  });

  it.each([0, -1, NaN])(
    "should reject an invalid target runner duration: %s",
    (targetRunnerMinutes) => {
      expect(() => setup({ targetRunnerMinutes })).toThrow();
    },
  );

  it("should size the full suite from all recorded timings when there is no plan", () => {
    const result = setup({ timings: timingsFor(80, 1) });

    expect(result.regularChunks).toBe(10);
    expect(result.config).toHaveLength(13);
    expect(result.config[0]).toMatchObject({
      name: "e2e-group-01",
      edition: "ee",
      runner: "runner",
    });
    expect(result.config[9].name).toBe("e2e-group-10");
  });

  it("should cap the full suite at the job budget", () => {
    const result = setup({ timings: timingsFor(500, 1) });

    expect(result.regularChunks).toBe(47);
    expect(result.config).toHaveLength(50);
  });

  it("should create no jobs for an empty plan", () => {
    expect(setup({ specFiles: [] })).toEqual({
      config: [],
      regularChunks: 0,
    });
  });

  it.each([
    [1, 1],
    [8, 1],
    [9, 2],
    [24, 3],
    [500, 47],
  ])(
    "should allocate %i selected one-minute specs to %i regular jobs",
    (count, regularChunks) => {
      const result = setup({ specFiles: specs(count) });

      expect(result.regularChunks).toBe(regularChunks);
      expect(result.config).toHaveLength(regularChunks + 3);
    },
  );

  it("should apply the target runner duration", () => {
    const result = setup({ specFiles: specs(24), targetRunnerMinutes: 4 });

    expect(result.regularChunks).toBe(6);
  });

  it("should ignore selected specs without recorded timings", () => {
    const result = setup({
      specFiles: [...specs(16), "e2e/test/scenarios/new.cy.spec.ts"],
      timings: timingsFor(16, 1),
    });

    expect(result.regularChunks).toBe(2);
  });

  it("should keep one regular job when no selected spec has recorded timings", () => {
    const result = setup({
      specFiles: ["e2e/test/scenarios/new.cy.spec.ts"],
    });

    expect(result.regularChunks).toBe(1);
  });

  it.each([null, specs(1), specs(500)])(
    "should retain every tagged variant",
    (specFiles) => {
      const result = setup({ specFiles });

      expect(result.config.slice(-3)).toMatchObject([
        { name: "oss-subset", edition: "oss", tags: "@OSS @prerelease+-@EE" },
        { name: "mongo", edition: "ee", tags: "@mongo" },
        { name: "python", edition: "ee", tags: "@python" },
      ]);
    },
  );

  it("should leave regular jobs to cypress-split", () => {
    const result = setup({ specFiles: specs(24) });

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
});
