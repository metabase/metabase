// Which app-DB jobs run, and with which versions and shards.
//
// A CI run covers the latest version of each app DB; a force-run covers every supported version. A
// direct dispatch names one app DB and runs that one alone. The result per job is the
// `strategy.matrix` it consumes, or null when it should not run at all -- so the workflow's only
// per-job conditional is whether a matrix came back for it.

import { appendFileSync } from "fs";

type Version = {
  name: string;
  image: string;
  "junit-name": string;
  env: Record<string, string>;
  latest: boolean;
};

type Shard = {
  name: string;
  "build-static-viz": boolean;
  "test-args": string;
};

type Matrix = { version: Version[]; job: Shard[] };

export const VERSIONS: Record<string, Version[]> = {
  mariadb: [
    {
      name: "MariaDB 10.6",
      image: "metabase/mariadb:10.6",
      "junit-name": "be-tests-mariadb-10-6-ee",
      env: { "enable-ssl-tests": "false" },
      latest: false,
    },
    {
      name: "MariaDB Latest",
      image: "mariadb:latest",
      "junit-name": "be-tests-mariadb-latest-ee",
      env: { "enable-ssl-tests": "false" },
      latest: true,
    },
  ],
  mysql: [
    {
      name: "MySQL 8",
      image: "mysql:8.4",
      "junit-name": "be-tests-mysql-8-ee",
      env: { "enable-ssl-tests": "false", "enable-aws-iam-tests": "false" },
      latest: false,
    },
    {
      name: "MySQL 9",
      image: "mysql:9",
      "junit-name": "be-tests-mysql-9-ee",
      env: { "enable-ssl-tests": "true", "enable-aws-iam-tests": "true" },
      // treating 9.0 as latest until we introduce mysql 26+ support
      latest: true,
    },
  ],
  postgres: [
    {
      name: "Postgres 14.x",
      image: "postgres:14-alpine",
      "junit-name": "be-tests-postgres-ee",
      env: { "enable-ssl-tests": "false", "enable-aws-iam-tests": "false" },
      latest: false,
    },
    {
      name: "Postgres Latest",
      image: "postgres:latest",
      "junit-name": "be-tests-postgres-latest-ee",
      env: { "enable-ssl-tests": "true", "enable-aws-iam-tests": "true" },
      latest: true,
    },
  ],
};

const COMMON_EXCLUDES =
  ":mb/driver-tests :mb/transforms-python-test :mb/old-migrations-test";

export const SHARDS: Shard[] = [
  {
    name: "Enterprise Tests",
    "build-static-viz": false,
    "test-args": `:only '"enterprise/backend/test"' :exclude-tags '[${COMMON_EXCLUDES}]'`,
  },
  {
    name: "EE App DB Tests (Part 1)", // migrations shard
    "build-static-viz": true,
    "test-args": `:only '"test"' :only-tags '[:mb/app-db-migrations-test]' :exclude-tags '[${COMMON_EXCLUDES}]'`,
  },
  {
    name: "EE App DB Tests (Part 2)",
    "build-static-viz": true,
    "test-args": `:only '"test"' :partition/total 2 :partition/index 0 :exclude-tags '[${COMMON_EXCLUDES} :mb/app-db-migrations-test]'`,
  },
  {
    name: "EE App DB Tests (Part 3)",
    "build-static-viz": true,
    "test-args": `:only '"test"' :partition/total 2 :partition/index 1 :exclude-tags '[${COMMON_EXCLUDES} :mb/app-db-migrations-test]'`,
  },
];

type PlanOptions = { run: boolean; forceRun?: boolean; onlyAppDb?: string };

// Keyed by job name, so the workflow reads `needs.gate.outputs.<job>` without a lookup table.
export function planAppDb({
  run,
  forceRun = false,
  onlyAppDb = "",
}: PlanOptions): Record<string, Matrix | null> {
  return Object.fromEntries(
    Object.entries(VERSIONS).map(([db, versions]) => {
      const wanted = run && (onlyAppDb === "" || onlyAppDb === db);
      const version = forceRun ? versions : versions.filter((it) => it.latest);

      return [`be-tests-${db}`, wanted ? { version, job: SHARDS } : null];
    }),
  );
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const plan = planAppDb({
    run: process.env.RUN === "true",
    forceRun: process.env.FORCE_RUN === "true",
    onlyAppDb: process.env.ONLY_APP_DB ?? "",
  });

  const entries = Object.entries(plan);

  entries.forEach(([job, matrix]) =>
    console.log(
      `${job}: ${matrix ? matrix.version.map((it) => it.name).join(", ") : "not running"}`,
    ),
  );

  // An empty value is how a job is told to sit this run out; its `if` is the only thing reading it.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    entries
      .map(([job, matrix]) => `${job}=${matrix ? JSON.stringify(matrix) : ""}\n`)
      .join(""),
  );
}
