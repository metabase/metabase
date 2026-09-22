// Which driver test jobs run.
//
// The rules below are policy: branch, labels, the dispatch input and the shared verdict. The facts
// they read about the repository come from `mage -driver-analysis`, which answers only what needs
// the Clojure module graph -- whether the driver module is affected, which drivers' own sources
// changed, and whether a module that explicitly triggers cloud drivers was touched.
//
// The result per job is `true`, or null when it should sit the run out, so the workflow's only
// per-job conditional is whether a decision came back for it.

import { appendFileSync } from "fs";

// What `mage -driver-analysis` reports about the diff.
export type Analysis = {
  // The `driver` module is reachable from a changed module.
  driverDepsAffected: boolean;
  // deps.edn or anything under modules/drivers/ changed, which can affect every driver.
  importantFileChanged: boolean;
  // Drivers whose own modules/drivers/<dir>/ sources changed.
  driversChanged: string[];
  // A changed module is one that explicitly triggers the cloud drivers.
  cloudTriggerModulesUpdated: boolean;
};

type Driver = {
  name: string;
  // The drivers.yml jobs this driver decides, in workflow order.
  jobs: string[];
  // Runs on cloud infrastructure and needs secrets: slow and rate-limited, so it stays out of a
  // run unless something points at it.
  cloud?: boolean;
  // Cheap, local, and broad enough to be worth running whenever the backend is tested at all.
  always?: boolean;
};

export const DRIVERS: Driver[] = [
  { name: "h2", jobs: ["be-tests-h2", "be-tests-h2-oss"], always: true },
  { name: "athena", jobs: ["be-tests-athena-ee"], cloud: true },
  {
    name: "bigquery",
    jobs: ["be-tests-bigquery-cloud-sdk-ee", "be-tests-bigquery-transforms-python-ee"],
    cloud: true,
  },
  { name: "clickhouse", jobs: ["be-tests-clickhouse-ee"] },
  { name: "databricks", jobs: ["be-tests-databricks-ee"], cloud: true },
  { name: "druid-jdbc", jobs: ["be-tests-druid-jdbc-ee"] },
  { name: "mongo", jobs: ["be-tests-mongo"] },
  { name: "mongo-ssl", jobs: ["be-tests-mongo-ssl"] },
  { name: "mongo-sharded-cluster", jobs: ["be-tests-mongo-sharded-cluster-ee"] },
  { name: "mysql-mariadb", jobs: ["be-tests-mysql-mariadb"] },
  { name: "oracle", jobs: ["be-tests-oracle"] },
  { name: "postgres", jobs: ["be-tests-postgres"], always: true },
  { name: "presto-jdbc", jobs: ["be-tests-presto-jdbc-ee"] },
  { name: "redshift", jobs: ["be-tests-redshift-ee"], cloud: true },
  { name: "snowflake", jobs: ["be-tests-snowflake-ee"], cloud: true },
  { name: "sparksql", jobs: ["be-tests-sparksql-ee"] },
  { name: "sqlite", jobs: ["be-tests-sqlite-ee"] },
  { name: "sqlserver", jobs: ["be-tests-sqlserver"] },
  // The ECR login only exists to pull the Vertica image, so it follows the same decision.
  { name: "vertica", jobs: ["login-to-ecr", "be-tests-vertica-ee"] },
];

// PR label that opts one driver into a run.
export const runDriverLabel = (driver: string) => `ci:run-${driver}`;

type Decision = { run: boolean; reason: string };

type DecideOptions = {
  // The shared gate's verdict: false means the diff touched no backend code.
  run: boolean;
  forceRun?: boolean;
  // A workflow_dispatch of drivers.yml naming one job.
  onlyDriver?: string;
  labels?: string[];
  analysis?: Analysis;
};

// Whether one driver runs, and why. The first matching rule wins; the order is the policy.
export function decideDriver(
  driver: Driver,
  { run, forceRun = false, onlyDriver = "", labels = [], analysis }: DecideOptions,
): Decision {
  // Asking for a job by name is a stronger signal than any rule below, so it does not even let
  // H2 and Postgres tag along.
  if (onlyDriver) {
    return driver.name === onlyDriver
      ? { run: true, reason: `requested via --only-driver=${onlyDriver}` }
      : { run: false, reason: `--only-driver=${onlyDriver} requested instead` };
  }
  if (forceRun) {
    return { run: true, reason: "force-run (master/release branch or ci:run-all label)" };
  }
  if (!run) {
    return { run: false, reason: "test gate skipped the suite (no backend changes)" };
  }
  if (driver.always) {
    return { run: true, reason: "H2/Postgres always run" };
  }
  if (labels.includes("ci:run-all-drivers")) {
    return { run: true, reason: "ci:run-all-drivers label" };
  }
  if (labels.includes(runDriverLabel(driver.name))) {
    return { run: true, reason: `${runDriverLabel(driver.name)} label` };
  }

  // Everything past here reads the module analysis, which only a force-run or a named driver is
  // allowed to skip -- and both returned above.
  if (!analysis) {
    throw new Error(
      `No module analysis, so there is nothing to decide ${driver.name} on`,
    );
  }
  const depsAffected =
    analysis.driverDepsAffected || analysis.importantFileChanged;

  if (analysis.driversChanged.includes(driver.name)) {
    return { run: true, reason: "driver files changed" };
  }
  if (driver.cloud) {
    if (labels.includes("ci:run-all-cloud-drivers")) {
      return { run: true, reason: "ci:run-all-cloud-drivers label" };
    }
    if (analysis.cloudTriggerModulesUpdated) {
      return { run: true, reason: "module updated which explicitly triggers cloud drivers" };
    }
    if (depsAffected) {
      return { run: true, reason: "driver module affected by shared code changes" };
    }
    return { run: false, reason: "no relevant changes for cloud driver" };
  }
  if (depsAffected) {
    return { run: true, reason: "driver module affected by shared code changes" };
  }
  return { run: false, reason: "driver module not affected" };
}

// Keyed by job name, so the workflow reads `needs.gate.outputs.<job>` without a lookup table.
export function planDrivers(options: DecideOptions): Record<string, true | null> {
  return Object.fromEntries(
    DRIVERS.flatMap((driver) => {
      const { run } = decideDriver(driver, options);
      return driver.jobs.map((job) => [job, run || null]);
    }),
  );
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const options: DecideOptions = {
    run: process.env.RUN === "true",
    forceRun: process.env.FORCE_RUN === "true",
    onlyDriver: process.env.ONLY_DRIVER ?? "",
    labels: (process.env.PR_LABELS ?? "").split(",").map((it) => it.trim()).filter(Boolean),
    analysis: process.env.ANALYSIS ? JSON.parse(process.env.ANALYSIS) : undefined,
  };

  const width = Math.max(...DRIVERS.map((driver) => driver.name.length));
  DRIVERS.forEach((driver) => {
    const { run, reason } = decideDriver(driver, options);
    console.log(
      `${driver.name.padEnd(width)}  ${run ? "RUN " : "SKIP"}  ${reason}`,
    );
  });

  console.log(
    "\nWant to force-run a driver? Add a ci:run-<driver> or ci:run-all-drivers label to the PR.",
  );

  // An empty value is how a job is told to sit this run out; its `if` is the only thing reading it.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    Object.entries(planDrivers(options))
      .map(([job, value]) => `${job}=${value ? "true" : ""}\n`)
      .join(""),
  );
}
