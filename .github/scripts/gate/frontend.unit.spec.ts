import { JOBS, UNIT_SHARDS, planFrontend } from "./frontend";

const FILTERS = ["frontend_all", "e2e_all", "custom_viz_all", "ci_scripts"];

const running = (plan: Record<string, unknown>) =>
  Object.entries(plan)
    .filter(([, value]) => value !== null)
    .map(([job]) => job);

describe("planFrontend", () => {
  it("plans every job the workflow declares", () => {
    expect(Object.keys(planFrontend({ matched: FILTERS }))).toEqual(
      JOBS.map((job) => job.name),
    );
  });

  // The gate job asks for exactly these filters, so a job keyed to anything else never runs.
  it("keys every job to a filter the gate requests", () => {
    JOBS.forEach((job) =>
      job.filters.forEach((filter) => expect(FILTERS).toContain(filter)),
    );
  });

  it("runs everything when the diff touches every filter", () => {
    expect(running(planFrontend({ matched: FILTERS }))).toEqual(
      JOBS.map((job) => job.name),
    );
  });

  it("plans nothing when the diff matched no filter", () => {
    expect(running(planFrontend({ matched: [] }))).toEqual([]);
  });

  it("shards the unit tests and leaves the other jobs matrix-free", () => {
    const plan = planFrontend({ matched: FILTERS });

    expect(plan["fe-tests-unit"]).toEqual({ shard: [1, 2] });
    expect(plan["fe-type-check"]).toBe(true);
  });

  it("numbers the unit shards from one", () => {
    const plan = planFrontend({ matched: ["frontend_all"] });

    expect(plan["fe-tests-unit"]).toEqual({
      shard: Array.from({ length: UNIT_SHARDS }, (_, index) => index + 1),
    });
  });

  // e2e specs are linted by the frontend linter, so an e2e-only change still runs it.
  it("lints on an e2e-only change, and runs nothing else", () => {
    expect(running(planFrontend({ matched: ["e2e_all"] }))).toEqual(["fe-lint"]);
  });

  it("runs the frontend jobs on a frontend change", () => {
    expect(running(planFrontend({ matched: ["frontend_all"] }))).toEqual([
      "fe-lint",
      "fe-type-check",
      "fe-tests-unit",
      "fe-tests-timezones",
    ]);
  });

  it("runs the CI script tests on their own", () => {
    expect(running(planFrontend({ matched: ["ci_scripts"] }))).toEqual([
      "fe-tests-ci-scripts",
    ]);
  });

  it("runs custom-viz on its own", () => {
    expect(running(planFrontend({ matched: ["custom_viz_all"] }))).toEqual([
      "fe-custom-viz",
    ]);
  });

  // An empty selection means a runner per shard would boot only to find nothing to run.
  it("drops the unit tests when the plan selected nothing", () => {
    const plan = planFrontend({ matched: FILTERS, unitSelection: "empty" });

    expect(plan["fe-tests-unit"]).toBeNull();
  });

  it.each(["", "full", "narrowed"] as const)(
    "runs the unit tests on a %s selection",
    (unitSelection) => {
      const plan = planFrontend({ matched: FILTERS, unitSelection });

      expect(plan["fe-tests-unit"]).toEqual({ shard: [1, 2] });
    },
  );

  // Only the unit specs are planned; nothing else the suite runs is narrowed by the plan.
  it("leaves the other jobs alone on an empty selection", () => {
    const plan = planFrontend({ matched: FILTERS, unitSelection: "empty" });

    expect(running(plan)).toEqual(
      JOBS.map((job) => job.name).filter((name) => name !== "fe-tests-unit"),
    );
  });

  it("drops the main jobs when the dispatch skips them, and keeps the rest", () => {
    expect(running(planFrontend({ matched: FILTERS, skip: true }))).toEqual([
      "fe-lint",
      "fe-tests-ci-scripts",
      "fe-custom-viz",
    ]);
  });

  it("drops linting when the dispatch skips it", () => {
    const plan = planFrontend({ matched: FILTERS, skipLint: true });

    expect(running(plan)).not.toContain("fe-lint");
  });

  it("drops custom-viz when the dispatch skips it", () => {
    const plan = planFrontend({ matched: FILTERS, skipCustomViz: true });

    expect(running(plan)).not.toContain("fe-custom-viz");
  });

  // No switch covers them, so a dispatch with every box ticked still runs the CI script tests.
  it("keeps the CI script tests out of reach of the dispatch switches", () => {
    const plan = planFrontend({
      matched: FILTERS,
      skip: true,
      skipLint: true,
      skipCustomViz: true,
    });

    expect(running(plan)).toEqual(["fe-tests-ci-scripts"]);
  });
});
