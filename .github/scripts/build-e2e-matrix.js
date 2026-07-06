// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";

// Number of chunks dedicated to specs tagged @external (tests that need the
// QA database containers: postgres/mysql). They get their own chunks so the
// regular chunks can skip starting those containers entirely.
const EXTERNAL_CHUNKS = 10;

// Tests tagged @external run against external QA databases. @mongo/@python
// tagged tests have their own dedicated jobs, and @OSS ones run in the
// oss-subset job, so they are excluded here even when also tagged @external.
const EXTERNAL_TAGS = "@external+-@mongo+-@python+-@OSS";

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

/**
 *
 * @param {*} inputSpecs - specs, which were changed in the PR, separated by comma
 * .e.g e2e/test/scenarios/onboarding/command-palette.cy.spec.js,e2e/test/scenarios/question/document-title.cy.spec.js
 * or a pattern like DEFAULT_SPEC_PATTERN
 */
function buildMatrix(options, inputSpecs, inputChunks) {
  const { java, defaultRunner } = options;

  // number of specs per chunk when running specific specs
  const SPECS_PER_CHUNK = 5;

  const defaultOptions = {
    "java-version": java,
    runner: defaultRunner,
    edition: "ee",
  };

  const isDefaultSpecPattern =
    inputSpecs === "" || inputSpecs === DEFAULT_SPEC_PATTERN;

  console.log("Processed specs value:", inputSpecs);
  console.log("Is default pattern:", isDefaultSpecPattern);

  let regularChunks;
  let externalChunks = 0;
  if (isDefaultSpecPattern) {
    externalChunks = EXTERNAL_CHUNKS;
    regularChunks = inputChunks - specialTestConfigs.length - externalChunks;
  } else {
    // when pattern is not default, it means we passed some custom list of the changed specs
    // so we need to calculate how many chunks we need to run
    const matchingSpecsCount = inputSpecs.split(",").length;
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  const regularTests = Array.from({ length: regularChunks }, (_, index) => {
    const paddedIndex = String(index + 1).padStart(2, "0");

    return {
      name: `e2e-group-${paddedIndex}`,
      // cypress-split coordinates; only used in the default-pattern mode
      // (custom spec lists are chunked explicitly below instead)
      split_index: isDefaultSpecPattern ? index : -1,
      total_chunks: isDefaultSpecPattern ? regularChunks : 0,
      // works when specs less than 5, otherwise seems all chunks will contain
      // same specs
      ...(!isDefaultSpecPattern && {
        specs: inputSpecs
          .split(",")
          .slice(SPECS_PER_CHUNK * index, SPECS_PER_CHUNK * (index + 1))
          .join(","),
      }),
    };
  });

  // Dedicated auto-split chunks for @external specs. They have no `specs`
  // value, so they take the auto-split path, with grep filtering the specs
  // down to the @external tagged ones.
  const externalTests = Array.from({ length: externalChunks }, (_, index) => {
    const paddedIndex = String(index + 1).padStart(2, "0");

    return {
      name: `e2e-group-external-${paddedIndex}`,
      tags: EXTERNAL_TAGS,
      split_index: index,
      total_chunks: externalChunks,
    };
  });

  const specialTests = specialTestConfigs.map((config) => ({
    ...config,
    split_index: -1,
    total_chunks: 0,
  }));

  const testSets = isDefaultSpecPattern
    ? regularTests.concat(externalTests, specialTests)
    : regularTests;

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks, isDefaultSpecPattern };
}

module.exports = { buildMatrix };
