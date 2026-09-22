import { SHARDS, VERSIONS, planAppDb } from "./app-db";

const JOBS = ["be-tests-mariadb", "be-tests-mysql", "be-tests-postgres"];

const names = (matrix: { version: { name: string }[] } | null) =>
  matrix?.version.map((it) => it.name);

describe("planAppDb", () => {
  it("plans a matrix for every app DB job the workflow declares", () => {
    expect(Object.keys(planAppDb({ run: true }))).toEqual(JOBS);
  });

  // An empty `version` vector fails the workflow rather than skipping the job, so every app DB
  // needs exactly one version marked latest.
  it.each(Object.keys(VERSIONS))(
    "marks exactly one %s version latest",
    (db) => {
      expect(VERSIONS[db].filter((it) => it.latest)).toHaveLength(1);
    },
  );

  it("runs the latest version of each app DB on an ordinary run", () => {
    const plan = planAppDb({ run: true });

    expect(names(plan["be-tests-mariadb"])).toEqual(["MariaDB Latest"]);
    expect(names(plan["be-tests-mysql"])).toEqual(["MySQL 9"]);
    expect(names(plan["be-tests-postgres"])).toEqual(["Postgres Latest"]);
  });

  it("runs every supported version on a force-run", () => {
    const plan = planAppDb({ run: true, forceRun: true });

    Object.entries(VERSIONS).forEach(([db, versions]) =>
      expect(names(plan[`be-tests-${db}`])).toEqual(
        versions.map((it) => it.name),
      ),
    );
  });

  it("gives every job the same shards", () => {
    const plan = planAppDb({ run: true });

    JOBS.forEach((job) => expect(plan[job]?.job).toEqual(SHARDS));
  });

  it("plans nothing when the gate says the suite should not run", () => {
    const plan = planAppDb({ run: false });

    expect(JOBS.map((job) => plan[job])).toEqual([null, null, null]);
  });

  it("plans only the dispatched app DB", () => {
    const plan = planAppDb({ run: true, onlyAppDb: "postgres" });

    expect(plan["be-tests-mariadb"]).toBeNull();
    expect(plan["be-tests-mysql"]).toBeNull();
    expect(names(plan["be-tests-postgres"])).toEqual(["Postgres Latest"]);
  });

  it("keeps the dispatched app DB out when the gate force-skips the run", () => {
    const plan = planAppDb({ run: false, onlyAppDb: "postgres" });

    expect(plan["be-tests-postgres"]).toBeNull();
  });
});
