// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";

const specialTestConfigs = [
  {
    name: "oss-subset",
    edition: "oss",
    tags: "@OSS @prerelease+-@EE",
    specs: DEFAULT_SPEC_PATTERN,
  },
  { name: "mongo", tags: "@mongo", specs: DEFAULT_SPEC_PATTERN },
  { name: "python", tags: "@python", specs: DEFAULT_SPEC_PATTERN },
];

function buildMatrix(options, specFiles, inputChunks) {
  const { java, defaultRunner } = options;
  if (
    !Number.isInteger(inputChunks) ||
    inputChunks <= specialTestConfigs.length
  ) {
    throw new Error(
      `E2E chunks must be greater than ${specialTestConfigs.length}`,
    );
  }
  const maxRegularChunks = inputChunks - specialTestConfigs.length;
  const regularChunks =
    specFiles === null
      ? maxRegularChunks
      : Math.min(maxRegularChunks, Math.ceil(specFiles.length / 5));

  if (specFiles?.length === 0) {
    return { config: [], regularChunks: 0 };
  }

  const regularTests = Array.from({ length: regularChunks }, (_, index) => ({
    name: `e2e-group-${String(index + 1).padStart(2, "0")}`,
  }));

  // Regular jobs exclude the OSS, Mongo, and Python tags, so these jobs must also run for selected specs.
  const config = regularTests.concat(specialTestConfigs).map((test) => ({
    "java-version": java,
    runner: defaultRunner,
    edition: "ee",
    ...test,
  }));

  return { config, regularChunks };
}

module.exports = { buildMatrix };
