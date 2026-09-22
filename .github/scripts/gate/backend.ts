// Which backend jobs run, and with which matrix.
//
// Most of the suite follows one question -- did backend sources change, or did the generated
// static-viz output shift underneath them -- and the two eastwood test linters split that between a
// force-run and a pull request. The project checks follow their own filters, and the job that holds
// them runs when any of its steps will.
//
// The result per job is the `strategy.matrix` it consumes, `true` for a job that has no matrix, or
// null when it should not run at all -- so the workflow's only per-job conditional is whether a
// plan came back for it.

import { appendFileSync } from "fs";

type Leg = {
  name: string;
  edition: "ee" | "oss";
  "test-group-name": string;
  "test-args": string;
};

type Matrix = { "java-version": number[]; job: Leg[] };

type Plan = Matrix | true | null;

export const JAVA_VERSIONS = [25];

const APP_DB = `:only '["test" ".clj-kondo/test"]'`;

export const LEGS: Leg[] = [
  {
    name: "Enterprise Tests",
    edition: "ee",
    "test-group-name": "ee",
    "test-args": `:only '"enterprise/backend/test"'`,
  },
  {
    name: "EE App DB Tests (Part 1)",
    edition: "ee",
    "test-group-name": "ee-app-db-1",
    "test-args": `${APP_DB} :partition/total 2 :partition/index 0`,
  },
  {
    name: "EE App DB Tests (Part 2)",
    edition: "ee",
    "test-group-name": "ee-app-db-2",
    "test-args": `${APP_DB} :partition/total 2 :partition/index 1`,
  },
  {
    name: "OSS App DB Tests (Part 1)",
    edition: "oss",
    "test-group-name": "oss-app-db-1",
    "test-args": `${APP_DB} :partition/total 2 :partition/index 0`,
  },
  {
    name: "OSS App DB Tests (Part 2)",
    edition: "oss",
    "test-group-name": "oss-app-db-2",
    "test-args": `${APP_DB} :partition/total 2 :partition/index 1`,
  },
];

// The suites the project-checks job runs, each a step in it. The job runs when any of them will,
// so the two cannot drift apart.
export const PROJECT_SUITES = [
  { name: "backend", filters: ["project_backend_checks"] },
  { name: "migrations", filters: ["project_migration_checks"] },
  // Babashka, not a JVM test run, so it rides along with the backend checks as well as its own.
  { name: "ratchets", filters: ["project_backend_checks", "project_ratchet_checks"] },
];

type PlanOptions = {
  // Which of the gate's filters the diff touched.
  matched: string[];
  forceRun?: boolean;
  pullRequest?: boolean;
  // Whether the built static-viz output differs from the base. Only the probe knows, and it only
  // runs when nothing else has already decided the suite.
  staticViz?: boolean;
};

// Keyed by job name, so the workflow reads `needs.gate.outputs.<job>` without a lookup table. The
// project-check steps are keyed the same way, under the job that holds them.
export function planBackend({
  matched,
  forceRun = false,
  pullRequest = false,
  staticViz = false,
}: PlanOptions): Record<string, Plan> {
  // Generated static-viz output can shift without any backend source changing, so the suite
  // follows it too.
  const backend = matched.includes("backend_all") || staticViz;

  const projectSteps = PROJECT_SUITES.map(
    (suite) =>
      [
        `project-checks-${suite.name}`,
        suite.filters.some((filter) => matched.includes(filter)) || null,
      ] as const,
  );

  return {
    ...Object.fromEntries(projectSteps),
    "project-checks": projectSteps.some(([, value]) => value) || null,

    "be-linter-clj-kondo": backend || null,
    "be-linter-eastwood": backend || null,
    // Master / release safety net: lint every backend test namespace.
    "be-linter-eastwood-test": (backend && forceRun) || null,
    // On a pull request, lint only the test namespaces the diff touched.
    "be-linter-eastwood-test-changed":
      (backend && !forceRun && pullRequest) || null,
    "be-check": backend || null,
    "be-cljfmt": backend || null,
    "be-tests": backend ? { "java-version": JAVA_VERSIONS, job: LEGS } : null,
  };
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const plan = planBackend({
    matched: JSON.parse(process.env.MATCHED || "[]"),
    forceRun: process.env.FORCE_RUN === "true",
    pullRequest: process.env.EVENT_NAME === "pull_request",
    staticViz: process.env.STATIC_VIZ === "true",
  });

  const entries = Object.entries(plan);

  entries.forEach(([job, value]) =>
    console.log(`${job}: ${value ? "running" : "not running"}`),
  );

  // An empty value is how a job is told to sit this run out; its `if` is the only thing reading it.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    entries
      .map(([job, value]) => `${job}=${value ? JSON.stringify(value) : ""}\n`)
      .join(""),
  );
}
