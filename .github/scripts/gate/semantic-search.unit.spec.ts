import {
  JOBS,
  LEGS,
  RUN_LABEL,
  planSemanticSearch,
} from "./semantic-search";

const ALL = JOBS.map((it) => it.name);

const running = (plan: Record<string, unknown>) =>
  Object.entries(plan)
    .filter(([, value]) => value !== null)
    .map(([job]) => job);

const names = (matrix: { version: { name: string }[] } | null) =>
  matrix?.version.map((it) => it.name);

describe("planSemanticSearch", () => {
  it("plans a matrix for every job the workflow declares", () => {
    expect(Object.keys(planSemanticSearch({ run: true }))).toEqual(ALL);
  });

  // The job that runs on a plain CI run is the one with a smoke leg, so the two cannot disagree.
  it("gives exactly one job a smoke leg", () => {
    const withSmoke = JOBS.filter((job) =>
      job.versions.some((it) => it.smoke),
    );

    expect(withSmoke.map((it) => it.name)).toEqual([
      "semantic-search-tests-postgres",
    ]);
  });

  it("plans nothing when the gate says the suite should not run", () => {
    expect(running(planSemanticSearch({ run: false }))).toEqual([]);
  });

  describe("an ordinary CI run", () => {
    it("runs Postgres Latest alone", () => {
      const plan = planSemanticSearch({ run: true });

      expect(running(plan)).toEqual(["semantic-search-tests-postgres"]);
      expect(names(plan["semantic-search-tests-postgres"])).toEqual([
        "Postgres Latest with pgvector pg17",
      ]);
    });
  });

  describe("a full run", () => {
    it.each([
      ["a force-run", { run: true, forceRun: true }],
      ["the run label", { run: true, labels: [RUN_LABEL] }],
    ])("runs every job and every version on %s", (_name, options) => {
      const plan = planSemanticSearch(options);

      expect(running(plan)).toEqual(ALL);
      JOBS.forEach((job) =>
        expect(names(plan[job.name])).toEqual(job.versions.map((it) => it.name)),
      );
    });

    it("is not triggered by an unrelated label", () => {
      const plan = planSemanticSearch({ run: true, labels: ["ci:run-all-drivers"] });

      expect(running(plan)).toEqual(["semantic-search-tests-postgres"]);
    });
  });

  describe("a direct dispatch", () => {
    it("runs only the named job", () => {
      const plan = planSemanticSearch({ run: true, suite: "mysql" });

      expect(running(plan)).toEqual(["semantic-search-tests-mysql"]);
    });

    // Asking for a job by name means the whole job, not the cheap corner of it.
    it("runs the named job in full", () => {
      const plan = planSemanticSearch({ run: true, suite: "postgres" });

      expect(names(plan["semantic-search-tests-postgres"])).toEqual([
        "Postgres 14.x with pgvector pg17",
        "Postgres Latest with pgvector pg17",
      ]);
    });

    it("keeps the named job out when the gate force-skips the run", () => {
      expect(
        planSemanticSearch({ run: false, suite: "mysql" })[
          "semantic-search-tests-mysql"
        ],
      ).toBeNull();
    });

    it.each(JOBS.map((it) => it.suite))("is reachable for %s", (suite) => {
      expect(running(planSemanticSearch({ run: true, suite }))).toHaveLength(1);
    });
  });

  it("gives every job the same test legs", () => {
    const plan = planSemanticSearch({ run: true, forceRun: true });

    ALL.forEach((job) => expect(plan[job]?.job).toEqual(LEGS));
  });
});
