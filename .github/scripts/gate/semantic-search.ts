// Which semantic-search jobs run, and with which versions.
//
// A CI run is a smoke run: the one leg marked `smoke` and nothing else, to keep PRs cheap. A
// force-run, or the `ci:run-semantic-search-tests` label, opens the whole matrix. A direct dispatch
// names one job and runs that one alone, in full. The result per job is the `strategy.matrix` it
// consumes, or null when it should not run at all -- so the workflow's only per-job conditional is
// whether a matrix came back for it.

import { appendFileSync } from "fs";

type Version = {
  name: string;
  "junit-name": string;
  // Kept by a plain CI run: enough to catch a break without paying for the whole matrix. A job
  // with no smoke leg is one a plain CI run does not reach at all.
  smoke?: boolean;
  "pgvector-image"?: string;
  "mariadb-image"?: string;
  "mysql-image"?: string;
  "postgres-image"?: string;
  "appdb-image"?: string;
};

type Leg = {
  name: string;
  "build-static-viz": boolean;
  "test-args": string;
  "exclude-tag": string;
};

type Matrix = { version: Version[]; job: Leg[] };

type Job = {
  // The drivers.yml-style job name, which is also the output the workflow reads.
  name: string;
  // The `suite` workflow_dispatch value that asks for this job by name.
  suite: string;
  versions: Version[];
};

export const RUN_LABEL = "ci:run-semantic-search-tests";

const PGVECTOR = "pgvector/pgvector:pg17";

// Every job runs the same tests; only the databases underneath them differ.
export const LEGS: Leg[] = [
  {
    name: "Semantic Search Tests",
    "build-static-viz": false,
    "test-args": `:only '["enterprise/backend/test/metabase_enterprise/semantic_search" "enterprise/backend/test/metabase_enterprise/entity_retrieval" "enterprise/backend/test/metabase_enterprise/metabot/tools/semantic_search_test.clj"]'`,
    "exclude-tag": ":mb/driver-tests",
  },
];

export const JOBS: Job[] = [
  {
    name: "semantic-search-tests-h2",
    suite: "h2",
    versions: [
      {
        name: "H2 with pgvector pg17",
        "junit-name": "semantic-search-tests-h2-pgvector-17",
        "pgvector-image": PGVECTOR,
      },
    ],
  },
  {
    name: "semantic-search-tests-mariadb",
    suite: "mariadb",
    versions: [
      {
        name: "MariaDB 10.6 with pgvector pg17",
        "junit-name": "semantic-search-tests-mariadb-10-6",
        // https://github.com/metabase/metabase-mariadb-docker-image
        "mariadb-image": "metabase/mariadb:10.6",
        "pgvector-image": PGVECTOR,
      },
      {
        name: "MariaDB Latest with pgvector pg17",
        "junit-name": "semantic-search-tests-mariadb-latest",
        "mariadb-image": "mariadb:latest",
        "pgvector-image": PGVECTOR,
      },
    ],
  },
  {
    name: "semantic-search-tests-mysql",
    suite: "mysql",
    // `mysql:latest` now resolves to MySQL 26.x, which fails in a way that floods the log until the
    // runner cancels the job. A cancelled job can't be soft-failed with continue-on-error, so there
    // is no `MySQL Latest` leg until 26.x is supported.
    versions: [
      {
        name: "MySQL 8.0 with pgvector pg17",
        "junit-name": "semantic-search-tests-mysql-8-0",
        "mysql-image": "mysql:8.0",
        "pgvector-image": PGVECTOR,
      },
      {
        name: "MySQL 9 with pgvector pg17",
        "junit-name": "semantic-search-tests-mysql-9",
        "mysql-image": "mysql:9",
        "pgvector-image": PGVECTOR,
      },
    ],
  },
  {
    name: "semantic-search-tests-postgres",
    suite: "postgres",
    versions: [
      {
        name: "Postgres 14.x with pgvector pg17",
        "junit-name": "semantic-search-tests-postgres-14",
        "postgres-image": "postgres:14-alpine",
        "pgvector-image": PGVECTOR,
      },
      {
        name: "Postgres Latest with pgvector pg17",
        "junit-name": "semantic-search-tests-postgres-latest",
        "postgres-image": "postgres:latest",
        "pgvector-image": PGVECTOR,
        smoke: true,
      },
    ],
  },
  {
    name: "semantic-search-tests-appdb-mode",
    suite: "appdb-mode",
    versions: [
      {
        name: "pgvector pg17 as app db, no dedicated pgvector",
        "junit-name": "semantic-search-tests-appdb-mode-pg17",
        "appdb-image": PGVECTOR,
      },
    ],
  },
];

type PlanOptions = {
  run: boolean;
  forceRun?: boolean;
  labels?: string[];
  // The `suite` workflow_dispatch input, or '' on an ordinary CI run.
  suite?: string;
};

// Keyed by job name, so the workflow reads `needs.gate.outputs.<job>` without a lookup table.
export function planSemanticSearch({
  run,
  forceRun = false,
  labels = [],
  suite = "",
}: PlanOptions): Record<string, Matrix | null> {
  const everything = forceRun || labels.includes(RUN_LABEL);

  return Object.fromEntries(
    JOBS.map((job) => {
      const smoke = job.versions.filter((it) => it.smoke);
      // A dispatch runs its job in full; so does a force-run or the label. Everything else keeps
      // the smoke legs, which is also what decides whether the job runs at all.
      const version = everything || suite !== "" ? job.versions : smoke;
      const wanted =
        run && (suite === job.suite || (suite === "" && version.length > 0));

      return [job.name, wanted ? { version, job: LEGS } : null];
    }),
  );
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const plan = planSemanticSearch({
    run: process.env.RUN === "true",
    forceRun: process.env.FORCE_RUN === "true",
    labels: (process.env.PR_LABELS ?? "").split(",").map((it) => it.trim()).filter(Boolean),
    suite: process.env.SUITE ?? "",
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
