// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";

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


  let regularChunks;
  if (isDefaultSpecPattern) {
    regularChunks = inputChunks;
  } else {
    // when pattern is not default, it means we passed some custom list of the changed specs
    // so we need to calculate how many chunks we need to run
    const matchingSpecsCount = inputSpecs.split(",").length;
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  const regularTests = new Array(regularChunks).fill(1).map((files, index) => ({
    name: `e2e-group-${index + 1}`,
    // works when specs less than 5, otherwise seems all chunks will contain
    // same specs
    ...(!isDefaultSpecPattern && {
      specs: inputSpecs
        .split(",")
        .slice(SPECS_PER_CHUNK * index, SPECS_PER_CHUNK * (index + 1))
        .join(","),
    }),
  }));

  const config = regularTests.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks, isDefaultSpecPattern };
}

module.exports = { buildMatrix };
