import { JAVA_VERSIONS, LEGS, PROJECT_SUITES, planBackend } from "./backend";

// Everything the shared gate asks for, minus the project filters.
const BACKEND_JOBS = [
  "be-linter-clj-kondo",
  "be-linter-eastwood",
  "be-check",
  "be-cljfmt",
  "be-tests",
];

const running = (plan: Record<string, unknown>) =>
  Object.entries(plan)
    .filter(([, value]) => value !== null)
    .map(([job]) => job);

describe("planBackend", () => {
  it("plans nothing when the diff matched no filter", () => {
    expect(running(planBackend({ matched: [] }))).toEqual([]);
  });

  describe("the backend suite", () => {
    it("runs on a backend_all match", () => {
      const plan = planBackend({ matched: ["backend_all"] });

      BACKEND_JOBS.forEach((job) => expect(plan[job]).not.toBeNull());
    });

    // Generated static-viz output can shift with no backend source changing at all.
    it("runs when only the static-viz output shifted", () => {
      const plan = planBackend({ matched: [], staticViz: true });

      BACKEND_JOBS.forEach((job) => expect(plan[job]).not.toBeNull());
    });

    it("gives be-tests the java versions and every leg", () => {
      const plan = planBackend({ matched: ["backend_all"] });

      expect(plan["be-tests"]).toEqual({
        "java-version": JAVA_VERSIONS,
        job: LEGS,
      });
    });

    it("splits the app DB legs evenly across both editions", () => {
      const partitioned = LEGS.filter((leg) =>
        leg["test-args"].includes(":partition/total 2"),
      );

      expect(partitioned).toHaveLength(4);
      expect(partitioned.filter((leg) => leg.edition === "ee")).toHaveLength(2);
      expect(partitioned.filter((leg) => leg.edition === "oss")).toHaveLength(2);
    });

    it("gives every leg its own test group name", () => {
      const names = LEGS.map((leg) => leg["test-group-name"]);

      expect(names).toEqual([...new Set(names)]);
    });
  });

  describe("the eastwood test linters", () => {
    it("lints every test namespace on a force-run", () => {
      const plan = planBackend({ matched: ["backend_all"], forceRun: true });

      expect(plan["be-linter-eastwood-test"]).toBe(true);
      expect(plan["be-linter-eastwood-test-changed"]).toBeNull();
    });

    it("lints only the changed ones on a pull request", () => {
      const plan = planBackend({ matched: ["backend_all"], pullRequest: true });

      expect(plan["be-linter-eastwood-test"]).toBeNull();
      expect(plan["be-linter-eastwood-test-changed"]).toBe(true);
    });

    // Exactly one of the two, never both and never neither, whenever the suite runs at all.
    it.each([
      ["a force-run", { forceRun: true, pullRequest: false }],
      ["a force-run of a pull request", { forceRun: true, pullRequest: true }],
      ["a pull request", { forceRun: false, pullRequest: true }],
    ])("picks one linter on %s", (_name, options) => {
      const plan = planBackend({ matched: ["backend_all"], ...options });
      const picked = [
        plan["be-linter-eastwood-test"],
        plan["be-linter-eastwood-test-changed"],
      ].filter(Boolean);

      expect(picked).toHaveLength(1);
    });

    it("runs neither when the backend suite is out", () => {
      const plan = planBackend({ matched: [], forceRun: true });

      expect(plan["be-linter-eastwood-test"]).toBeNull();
      expect(plan["be-linter-eastwood-test-changed"]).toBeNull();
    });
  });

  describe("the project checks", () => {
    it.each(PROJECT_SUITES.map((it) => it.name))(
      "keeps the %s step out when nothing matched",
      (suite) => {
        expect(planBackend({ matched: [] })[`project-checks-${suite}`]).toBeNull();
      },
    );

    it("runs the backend and ratchet steps on project_backend_checks", () => {
      const plan = planBackend({ matched: ["project_backend_checks"] });

      expect(plan["project-checks-backend"]).toBe(true);
      expect(plan["project-checks-ratchets"]).toBe(true);
      expect(plan["project-checks-migrations"]).toBeNull();
    });

    it("runs the ratchet step on its own filter alone", () => {
      const plan = planBackend({ matched: ["project_ratchet_checks"] });

      expect(plan["project-checks-ratchets"]).toBe(true);
      expect(plan["project-checks-backend"]).toBeNull();
    });

    // The job exists to hold the steps, so it follows them rather than repeating their filters.
    it.each(PROJECT_SUITES)("runs the job for the $name step", (suite) => {
      const plan = planBackend({ matched: [suite.filters[0]] });

      expect(plan["project-checks"]).toBe(true);
    });

    it("skips the job when no step will run", () => {
      expect(planBackend({ matched: ["backend_all"] })["project-checks"]).toBeNull();
    });

    // They answer to their own filters, so a backend change alone does not drag them in.
    it("is independent of the backend suite", () => {
      const plan = planBackend({ matched: ["project_migration_checks"] });

      expect(plan["project-checks"]).toBe(true);
      expect(plan["be-tests"]).toBeNull();
    });
  });
});
