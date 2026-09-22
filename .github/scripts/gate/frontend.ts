// Which frontend jobs run, and with which shards.
//
// A job runs when the diff touched any of the paths filters it covers, the dispatch did not switch
// it off, and the run's test plan left it something to do. The result per job is the
// `strategy.matrix` it consumes, `true` for a job that has no matrix, or null when it should not run
// at all -- so the workflow's only per-job conditional is whether a plan came back for it.

import { appendFileSync } from "fs";

type Matrix = { shard: number[] };

type Plan = Matrix | true | null;

// The workflow_dispatch checkboxes, which are all empty on a workflow_call.
type Switches = { skip: boolean; skipLint: boolean; skipCustomViz: boolean };

// What the run's test plan left a suite to do, as prepare-test-selection reports it. An empty
// string means there was no usable plan, and the suite runs in full.
type Selection = "" | "full" | "narrowed" | "empty";

type Job = {
  name: string;
  // Names from .github/file-paths.yaml; the job runs when the diff matched any of them.
  filters: string[];
  skippedBy?: keyof Switches;
  // The test-plan suite that narrows this job. It sits the run out on an empty selection rather
  // than starting a runner per shard to find there is nothing to run.
  suite?: "unit";
  matrix?: Matrix;
};

export const UNIT_SHARDS = 2;

export const JOBS: Job[] = [
  {
    name: "fe-lint",
    // Linting covers the e2e specs too.
    filters: ["frontend_all", "e2e_all"],
    skippedBy: "skipLint",
  },
  { name: "fe-type-check", filters: ["frontend_all"], skippedBy: "skip" },
  {
    name: "fe-tests-unit",
    filters: ["frontend_all"],
    skippedBy: "skip",
    suite: "unit",
    matrix: {
      shard: Array.from({ length: UNIT_SHARDS }, (_, index) => index + 1),
    },
  },
  { name: "fe-tests-timezones", filters: ["frontend_all"], skippedBy: "skip" },
  { name: "fe-tests-ci-scripts", filters: ["ci_scripts"] },
  {
    name: "fe-custom-viz",
    filters: ["custom_viz_all"],
    skippedBy: "skipCustomViz",
  },
];

type PlanOptions = Partial<Switches> & {
  matched: string[];
  unitSelection?: Selection;
};

// Keyed by job name, so the workflow reads `needs.gate.outputs.<job>` without a lookup table.
export function planFrontend({
  matched,
  unitSelection = "",
  skip = false,
  skipLint = false,
  skipCustomViz = false,
}: PlanOptions): Record<string, Plan> {
  const switches: Switches = { skip, skipLint, skipCustomViz };
  const selections: Record<NonNullable<Job["suite"]>, Selection> = {
    unit: unitSelection,
  };

  return Object.fromEntries(
    JOBS.map((job) => {
      const wanted =
        job.filters.some((filter) => matched.includes(filter)) &&
        !(job.skippedBy && switches[job.skippedBy]) &&
        !(job.suite && selections[job.suite] === "empty");

      return [job.name, wanted ? (job.matrix ?? true) : null];
    }),
  );
}

const describePlan = (plan: Plan) =>
  plan === null
    ? "not running"
    : plan === true
      ? "running"
      : `running ${JSON.stringify(plan)}`;

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const plan = planFrontend({
    matched: JSON.parse(process.env.MATCHED || "[]"),
    unitSelection: (process.env.UNIT_SELECTION ?? "") as Selection,
    skip: process.env.SKIP === "true",
    skipLint: process.env.SKIP_LINT === "true",
    skipCustomViz: process.env.SKIP_CUSTOM_VIZ === "true",
  });

  const entries = Object.entries(plan);

  entries.forEach(([job, value]) =>
    console.log(`${job}: ${describePlan(value)}`),
  );

  // An empty value is how a job is told to sit this run out; its `if` is the only thing reading it.
  appendFileSync(
    process.env.GITHUB_OUTPUT as string,
    entries
      .map(([job, value]) => `${job}=${value ? JSON.stringify(value) : ""}\n`)
      .join(""),
  );
}
