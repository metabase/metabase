// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { readSpecPaths } from "../../e2e/runner/read-spec-paths";

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";
const TIMINGS_FILE = "e2e/support/timings.json";
// Spec paths in timings.json are relative to this directory.
const TIMINGS_DIR = path.posix.dirname(TIMINGS_FILE);
const MS_PER_MINUTE = 60_000;

type SpecTiming = { spec: string; duration: number };
export type Timings = { durations: SpecTiming[] };

type MatrixJob = {
  name: string;
  edition?: "ee" | "oss";
  tags?: string;
  specs?: string;
};

type MatrixEntry = MatrixJob & {
  "java-version": number;
  runner: string;
  edition: "ee" | "oss";
};

const taggedJobs: MatrixJob[] = [
  {
    name: "oss-subset",
    edition: "oss",
    tags: "@OSS @prerelease+-@EE",
    specs: DEFAULT_SPEC_PATTERN,
  },
  { name: "mongo", tags: "@mongo", specs: DEFAULT_SPEC_PATTERN },
  { name: "python", tags: "@python", specs: DEFAULT_SPEC_PATTERN },
];

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Specs without a recorded duration count as the average duration, as in cypress-split.
function getTotalTestMinutes(
  timings: Timings,
  specFiles: string[] | null,
): number {
  const durations = new Map(
    timings.durations.map(({ spec, duration }) => [
      path.posix.join(TIMINGS_DIR, spec),
      duration,
    ]),
  );
  const recordedDurations = [...durations.values()];
  const averageDuration =
    recordedDurations.length > 0
      ? sum(recordedDurations) / recordedDurations.length
      : 0;
  const selectedDurations =
    specFiles === null
      ? recordedDurations
      : specFiles.map(
          (spec) =>
            durations.get(path.posix.normalize(spec)) ?? averageDuration,
        );

  return sum(selectedDurations) / MS_PER_MINUTE;
}

export function buildMatrix({
  java,
  defaultRunner,
  specFiles,
  maxJobs,
  timings,
  targetRunnerMinutes,
}: {
  java: number;
  defaultRunner: string;
  /** null runs the full suite. */
  specFiles: string[] | null;
  maxJobs: number;
  timings: Timings;
  targetRunnerMinutes: number;
}): { config: MatrixEntry[]; regularChunks: number } {
  if (!Number.isInteger(maxJobs) || maxJobs <= taggedJobs.length) {
    throw new Error(
      `E2E job limit must be an integer greater than ${taggedJobs.length} to allow at least one regular job alongside the tagged jobs`,
    );
  }
  if (!(targetRunnerMinutes > 0)) {
    throw new Error("E2E target runner minutes must be a positive number");
  }

  if (specFiles?.length === 0) {
    return { config: [], regularChunks: 0 };
  }

  const maxRegularJobs = maxJobs - taggedJobs.length;
  const neededJobs = Math.ceil(
    getTotalTestMinutes(timings, specFiles) / targetRunnerMinutes,
  );
  const regularChunks = Math.min(maxRegularJobs, Math.max(1, neededJobs));

  const regularJobs: MatrixJob[] = Array.from(
    { length: regularChunks },
    (_, index) => ({
      name: `e2e-group-${String(index + 1).padStart(2, "0")}`,
    }),
  );

  // Regular jobs exclude the OSS, Mongo, and Python tags, so these jobs must also run for selected specs.
  const config = [...regularJobs, ...taggedJobs].map((test) => ({
    "java-version": java,
    runner: defaultRunner,
    edition: "ee" as const,
    ...test,
  }));

  return { config, regularChunks };
}

function isSpecTiming(value: unknown): value is SpecTiming {
  return (
    typeof value === "object" &&
    value !== null &&
    "spec" in value &&
    typeof value.spec === "string" &&
    "duration" in value &&
    typeof value.duration === "number"
  );
}

function readTimings(file: string): Timings {
  const timings: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (
    typeof timings !== "object" ||
    timings === null ||
    !("durations" in timings) ||
    !Array.isArray(timings.durations) ||
    !timings.durations.every(isSpecTiming)
  ) {
    throw new Error(`Invalid e2e timings in ${file}`);
  }
  return { durations: timings.durations };
}

if (require.main === module) {
  const {
    GITHUB_OUTPUT,
    JAVA_VERSION,
    DEFAULT_RUNNER,
    E2E_SPEC_PATHS_FILE,
    E2E_MAX_JOBS,
    E2E_TARGET_RUNNER_MINUTES,
  } = process.env;
  if (!GITHUB_OUTPUT || !DEFAULT_RUNNER) {
    throw new Error("GITHUB_OUTPUT and DEFAULT_RUNNER are required");
  }

  const { config, regularChunks } = buildMatrix({
    java: Number(JAVA_VERSION),
    defaultRunner: DEFAULT_RUNNER,
    specFiles: readSpecPaths(E2E_SPEC_PATHS_FILE),
    maxJobs: Number(E2E_MAX_JOBS),
    timings: readTimings(TIMINGS_FILE),
    targetRunnerMinutes: Number(E2E_TARGET_RUNNER_MINUTES),
  });

  appendFileSync(
    GITHUB_OUTPUT,
    [
      `regularChunks=${JSON.stringify(regularChunks)}`,
      `config=${JSON.stringify({ include: config })}`,
      `hasTests=${config.length > 0}`,
      "",
    ].join("\n"),
  );

  console.log({ regularChunks });
  console.log("matrix config", config);
}
