import {
  type Analysis,
  DRIVERS,
  decideDriver,
  planDrivers,
  runDriverLabel,
} from "./drivers";

const driver = (name: string) => {
  const found = DRIVERS.find((it) => it.name === name);
  if (!found) {
    throw new Error(`No such driver: ${name}`);
  }
  return found;
};

const QUIET: Analysis = {
  driverDepsAffected: false,
  importantFileChanged: false,
  driversChanged: [],
  cloudTriggerModulesUpdated: false,
};

const CLOUD = DRIVERS.filter((it) => it.cloud).map((it) => it.name);
const SELF_HOSTED = DRIVERS.filter((it) => !it.cloud && !it.always).map(
  (it) => it.name,
);
const ALWAYS = DRIVERS.filter((it) => it.always).map((it) => it.name);

const decide = (name: string, options: Parameters<typeof decideDriver>[1]) =>
  decideDriver(driver(name), options);

const running = (plan: Record<string, true | null>) =>
  Object.entries(plan)
    .filter(([, value]) => value !== null)
    .map(([job]) => job);

describe("the driver catalogue", () => {
  it("names every job exactly once", () => {
    const jobs = DRIVERS.flatMap((it) => it.jobs);

    expect(jobs).toEqual([...new Set(jobs)]);
  });

  it("classifies the cloud drivers", () => {
    expect(CLOUD).toEqual([
      "athena",
      "bigquery",
      "databricks",
      "redshift",
      "snowflake",
    ]);
  });

  it("always runs H2 and Postgres", () => {
    expect(ALWAYS).toEqual(["h2", "postgres"]);
  });
});

// Priority 0
describe("--only-driver", () => {
  it("runs just that driver", () => {
    expect(decide("bigquery", { run: true, onlyDriver: "bigquery" }).run).toBe(
      true,
    );
    ["h2", "postgres", "mysql-mariadb"].forEach((name) =>
      expect(decide(name, { run: true, onlyDriver: "bigquery" }).run).toBe(false),
    );
  });

  // Asking for a job by name is a stronger signal than the rules below it.
  it("beats every other rule", () => {
    const options = {
      run: true,
      onlyDriver: "bigquery",
      labels: ["ci:run-all-drivers"],
      analysis: { ...QUIET, driverDepsAffected: true },
    };

    expect(decide("bigquery", options).run).toBe(true);
    expect(decide("h2", options).run).toBe(false);
  });

  // Priority 0 returns before the verdict is consulted, so a dispatch runs its job regardless.
  it("runs even when the gate skipped the suite", () => {
    expect(
      decide("bigquery", { run: false, onlyDriver: "bigquery" }).run,
    ).toBe(true);
  });
});

// Priority 1 and 2
describe("the shared verdict", () => {
  it("runs every driver on a force-run, with no analysis to consult", () => {
    DRIVERS.forEach((it) =>
      expect(decideDriver(it, { run: true, forceRun: true }).run).toBe(true),
    );
  });

  it("skips every driver when the gate skipped the suite", () => {
    DRIVERS.forEach((it) =>
      expect(decideDriver(it, { run: false, analysis: QUIET }).run).toBe(false),
    );
  });
});

// Priority 3
describe("H2 and Postgres", () => {
  it("run whenever the backend is tested at all", () => {
    ALWAYS.forEach((name) =>
      expect(decide(name, { run: true, analysis: QUIET }).run).toBe(true),
    );
  });

  it("stay out when the gate skipped the suite", () => {
    ALWAYS.forEach((name) =>
      expect(decide(name, { run: false, analysis: QUIET }).run).toBe(false),
    );
  });
});

// Priority 4
describe("the run labels", () => {
  it("runs everything on ci:run-all-drivers", () => {
    DRIVERS.forEach((it) =>
      expect(
        decideDriver(it, {
          run: true,
          labels: ["ci:run-all-drivers"],
          analysis: QUIET,
        }).run,
      ).toBe(true),
    );
  });

  it("runs one driver on its own label, and no other", () => {
    const options = {
      run: true,
      labels: [runDriverLabel("mysql-mariadb")],
      analysis: QUIET,
    };

    expect(decide("mysql-mariadb", options).run).toBe(true);
    expect(decide("mongo", options).run).toBe(false);
    expect(decide("snowflake", options).run).toBe(false);
  });
});

// Priority 5
describe("a driver's own sources", () => {
  it("runs that driver, whatever else the diff left alone", () => {
    ["mongo", "snowflake", "databricks"].forEach((name) => {
      const analysis = { ...QUIET, driversChanged: [name] };

      expect(decide(name, { run: true, analysis })).toEqual({
        run: true,
        reason: "driver files changed",
      });
    });
  });
});

// Priorities 6 to 9
describe("the cloud drivers", () => {
  it("run on ci:run-all-cloud-drivers", () => {
    CLOUD.forEach((name) =>
      expect(
        decide(name, {
          run: true,
          labels: ["ci:run-all-cloud-drivers"],
          analysis: QUIET,
        }).run,
      ).toBe(true),
    );
  });

  it("run when a module that explicitly triggers them was updated", () => {
    const analysis = { ...QUIET, cloudTriggerModulesUpdated: true };

    CLOUD.forEach((name) =>
      expect(decide(name, { run: true, analysis }).run).toBe(true),
    );
  });

  it("run when the driver module is affected by shared code", () => {
    const analysis = { ...QUIET, driverDepsAffected: true };

    CLOUD.forEach((name) =>
      expect(decide(name, { run: true, analysis }).run).toBe(true),
    );
  });

  // They are slow and rate-limited, so nothing pointing at them means they sit the run out.
  it("stay out when nothing points at them", () => {
    CLOUD.forEach((name) =>
      expect(decide(name, { run: true, analysis: QUIET })).toEqual({
        run: false,
        reason: "no relevant changes for cloud driver",
      }),
    );
  });
});

// Priorities 10 and 11
describe("the self-hosted drivers", () => {
  it("run when the driver module is affected by shared code", () => {
    const analysis = { ...QUIET, driverDepsAffected: true };

    SELF_HOSTED.forEach((name) =>
      expect(decide(name, { run: true, analysis }).run).toBe(true),
    );
  });

  // deps.edn and modules/drivers/** can affect any driver, so they count as the module being hit.
  it("run when an important file changed", () => {
    const analysis = { ...QUIET, importantFileChanged: true };

    SELF_HOSTED.forEach((name) =>
      expect(decide(name, { run: true, analysis }).run).toBe(true),
    );
  });

  it("stay out when the driver module is untouched", () => {
    SELF_HOSTED.forEach((name) =>
      expect(decide(name, { run: true, analysis: QUIET })).toEqual({
        run: false,
        reason: "driver module not affected",
      }),
    );
  });
});

// Rules past priority 4 have facts to weigh, and silently skipping a driver for want of them would
// look exactly like a clean diff.
describe("a missing analysis", () => {
  it("fails rather than deciding on nothing", () => {
    expect(() => decide("snowflake", { run: true })).toThrow(
      /nothing to decide snowflake on/,
    );
  });

  it("is fine for the rules that never read it", () => {
    expect(decide("snowflake", { run: true, forceRun: true }).run).toBe(true);
    expect(decide("snowflake", { run: false }).run).toBe(false);
    expect(decide("h2", { run: true }).run).toBe(true);
    expect(
      decide("snowflake", { run: true, labels: ["ci:run-all-drivers"] }).run,
    ).toBe(true);
  });
});

describe("planDrivers", () => {
  it("fans one driver's decision out to every job it gates", () => {
    const plan = planDrivers({ run: true, onlyDriver: "vertica" });

    expect(running(plan)).toEqual(["login-to-ecr", "be-tests-vertica-ee"]);
  });

  it("runs the pair of H2 jobs on an ordinary backend change", () => {
    const plan = planDrivers({ run: true, analysis: QUIET });

    expect(running(plan)).toEqual([
      "be-tests-h2",
      "be-tests-h2-oss",
      "be-tests-postgres",
    ]);
  });

  it("plans nothing when the gate skipped the suite", () => {
    expect(running(planDrivers({ run: false, analysis: QUIET }))).toEqual([]);
  });

  it("plans every job on a force-run", () => {
    const plan = planDrivers({ run: true, forceRun: true });

    expect(running(plan)).toEqual(DRIVERS.flatMap((it) => it.jobs));
  });
});
