import {
  type Timings,
  buildMatrix,
  specsMentionTags,
} from "./build-e2e-matrix";

const MINUTE_MS = 60_000;

const specs = (count: number) =>
  Array.from({ length: count }, (_, i) => `e2e/test/scenarios/${i}.cy.spec.ts`);

// Gives every spec from specs(count) the same duration, in the timings.json path format.
const timingsFor = (count: number, minutesPerSpec: number): Timings => ({
  durations: Array.from({ length: count }, (_, i) => ({
    spec: `../test/scenarios/${i}.cy.spec.ts`,
    duration: minutesPerSpec * MINUTE_MS,
  })),
});

// Spec sources for the tag search; specs not listed here have no tags.
type Sources = Record<string, string>;

type SetupOpts = {
  sources?: Sources;
  specFiles?: string[] | null;
  maxJobs?: number;
  timings?: Timings;
  targetRunnerMinutes?: number;
};

const setup = ({
  sources = {},
  specFiles = null,
  maxJobs = 50,
  timings = timingsFor(500, 1),
  targetRunnerMinutes = 8,
}: SetupOpts = {}) =>
  buildMatrix({
    java: 25,
    defaultRunner: "runner",
    specFiles,
    maxJobs,
    timings,
    targetRunnerMinutes,
    readSpec: (file) => sources[file] ?? "",
  });

describe("buildMatrix", () => {
  it.each([0, 2, 2.5])("should reject an invalid job budget: %s", (maxJobs) => {
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
    expect(result.config).toHaveLength(12);
    expect(result.config[0]).toMatchObject({
      name: "e2e-group-01",
      edition: "ee",
      runner: "runner",
    });
    expect(result.config[9].name).toBe("e2e-group-10");
  });

  it("should cap the full suite at the job budget", () => {
    const result = setup({ timings: timingsFor(500, 1) });

    expect(result.regularChunks).toBe(48);
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
    [500, 48],
  ])(
    "should allocate %i selected one-minute specs to %i regular jobs",
    (count, regularChunks) => {
      const result = setup({ specFiles: specs(count) });

      expect(result.regularChunks).toBe(regularChunks);
      expect(result.config).toHaveLength(regularChunks);
    },
  );

  it("should apply the target runner duration", () => {
    const result = setup({ specFiles: specs(24), targetRunnerMinutes: 4 });

    expect(result.regularChunks).toBe(6);
  });

  it("should count selected specs without recorded timings as the average duration", () => {
    // Recorded durations of 1 and 3 minutes average to 2 minutes.
    const timings: Timings = {
      durations: [
        { spec: "../test/scenarios/short.cy.spec.ts", duration: MINUTE_MS },
        { spec: "../test/scenarios/long.cy.spec.ts", duration: 3 * MINUTE_MS },
      ],
    };
    const newSpecs = Array.from(
      { length: 5 },
      (_, i) => `e2e/test/scenarios/new-${i}.cy.spec.ts`,
    );

    const result = setup({
      specFiles: ["e2e/test/scenarios/short.cy.spec.ts", ...newSpecs],
      timings,
      targetRunnerMinutes: 1,
    });

    expect(result.regularChunks).toBe(11);
  });

  it("should keep one regular job when there are no recorded timings", () => {
    const result = setup({
      specFiles: ["e2e/test/scenarios/new.cy.spec.ts"],
      timings: { durations: [] },
    });

    expect(result.regularChunks).toBe(1);
  });

  it("should run every tagged job for the full suite", () => {
    const result = setup();

    expect(result.config.slice(-2)).toMatchObject([
      { name: "oss-subset", edition: "oss", tags: "@OSS @prerelease+-@EE" },
      { name: "python", edition: "ee", tags: "@python" },
    ]);
  });

  it("should not create a Mongo job, since the regular jobs run @mongo tests", () => {
    const names = setup().config.map((job) => job.name);

    expect(names).not.toContain("mongo");
  });

  it("should skip tagged jobs when no selected spec carries their tags", () => {
    const result = setup({
      specFiles: specs(3),
      sources: {
        [specs(3)[0]]: 'describe("x", { tags: "@mongo" }, () => {});',
      },
    });

    expect(result.config.map((job) => job.name)).toEqual(["e2e-group-01"]);
  });

  it.each([
    ['{ tags: "@OSS" }', ["oss-subset"]],
    ['{ tags: ["@prerelease"] }', ["oss-subset"]],
    ["{ tags: ['@external', '@python'] }", ["python"]],
    ['{ tags: "@OSS" } ... { tags: "@python" }', ["oss-subset", "python"]],
  ])(
    "should keep the tagged jobs a selected spec needs: %s",
    (source, jobs) => {
      const [first, second] = specs(2);
      const result = setup({
        specFiles: [first, second],
        sources: { [second]: source },
      });

      expect(
        result.config.slice(result.regularChunks).map((j) => j.name),
      ).toEqual(jobs);
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

describe("specsMentionTags", () => {
  const read = (sources: Sources) => (file: string) => {
    if (!(file in sources)) {
      throw new Error(`ENOENT: ${file}`);
    }
    return sources[file];
  };

  it("should match whole tags only", () => {
    expect(
      specsMentionTags(["a"], ["@OSS"], read({ a: '{ tags: "@OSS-ish" }' })),
    ).toBe(false);
    expect(
      specsMentionTags(["a"], ["@OSS"], read({ a: '{ tags: "@OSSified" }' })),
    ).toBe(false);
    expect(
      specsMentionTags(["a"], ["@OSS"], read({ a: '{ tags: "@OSS" }' })),
    ).toBe(true);
  });

  it("should keep the job when a spec cannot be read", () => {
    expect(specsMentionTags(["missing"], ["@python"], read({}))).toBe(true);
  });
});
