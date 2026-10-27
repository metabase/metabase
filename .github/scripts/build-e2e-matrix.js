// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

const path = require("node:path");

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";
// Spec paths in timings.json are relative to this directory.
const TIMINGS_DIR = "e2e/support";
const MS_PER_MINUTE = 60_000;

const taggedJobs = [
  {
    name: "oss-subset",
    edition: "oss",
    tags: "@OSS @prerelease+-@EE",
    specs: DEFAULT_SPEC_PATTERN,
  },
  { name: "mongo", tags: "@mongo", specs: DEFAULT_SPEC_PATTERN },
  { name: "python", tags: "@python", specs: DEFAULT_SPEC_PATTERN },
];

// Specs without a recorded duration count as zero.
function getTotalTestMinutes(timings, specFiles) {
  const durations = new Map(
    timings.durations.map(({ spec, duration }) => [
      path.posix.join(TIMINGS_DIR, spec),
      duration,
    ]),
  );
  const selectedDurations =
    specFiles === null
      ? [...durations.values()]
      : specFiles.map((spec) => durations.get(path.posix.normalize(spec)) ?? 0);

  return (
    selectedDurations.reduce((total, duration) => total + duration, 0) /
    MS_PER_MINUTE
  );
}

function buildMatrix({
  java,
  defaultRunner,
  specFiles,
  maxJobs,
  timings,
  targetRunnerMinutes,
}) {
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

  const regularJobs = Array.from({ length: regularChunks }, (_, index) => ({
    name: `e2e-group-${String(index + 1).padStart(2, "0")}`,
  }));

  // Regular jobs exclude the OSS, Mongo, and Python tags, so these jobs must also run for selected specs.
  const config = [...regularJobs, ...taggedJobs].map((test) => ({
    "java-version": java,
    runner: defaultRunner,
    edition: "ee",
    ...test,
  }));

  return { config, regularChunks };
}

module.exports = { buildMatrix };
