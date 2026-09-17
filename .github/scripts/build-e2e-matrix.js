// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

const SPECS_PER_JOB = 5;
const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";

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

function buildMatrix(options, specFiles, maxJobs) {
  const { java, defaultRunner } = options;
  if (!Number.isInteger(maxJobs) || maxJobs <= taggedJobs.length) {
    throw new Error(
      `E2E job limit must be an integer greater than ${taggedJobs.length} to allow at least one regular job alongside the tagged jobs`,
    );
  }

  if (specFiles?.length === 0) {
    return { config: [], regularChunks: 0 };
  }

  const maxRegularJobs = maxJobs - taggedJobs.length;
  let regularChunks = maxRegularJobs;
  if (specFiles !== null) {
    const jobsForSelectedSpecs = Math.ceil(specFiles.length / SPECS_PER_JOB);
    regularChunks = Math.min(maxRegularJobs, jobsForSelectedSpecs);
  }

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
