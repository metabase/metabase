const { minimatch } = require('minimatch');
const fs = require("fs");
// This script is used in .github/workflows/e2e-matrix-builder.yml
// its aim is to split the e2e test matrix into multiple jobs
// grouping some specific tests together, other tests are split into chunks

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";
const { e2eMatrixMap } = require("./e2e-matrix-map");

const specialTestConfigs = [
  {
    name: "oss-subset",
    edition: "oss",
    tags: "@OSS @smoke+-@EE",
    specs: DEFAULT_SPEC_PATTERN,
  },
  { name: "mongo", tags: "@mongo", specs: DEFAULT_SPEC_PATTERN },
  { name: "python", tags: "@python", specs: DEFAULT_SPEC_PATTERN },
];

/**
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

  const changedFiles = fs.readFileSync("changed-files.txt", "utf-8");

  console.log({ changedFiles });

  const matchedSpecFolders = getRelevantSpecs(changedFiles);

  console.log({ matchedSpecFolders });

  console.log("Matched spec folders:", matchedSpecFolders);

  console.log("Processed specs value:", inputSpecs);
  console.log("Is default pattern:", isDefaultSpecPattern);

  let regularChunks;
  if (isDefaultSpecPattern) {
    regularChunks = inputChunks - specialTestConfigs.length;
  } else {
    // when pattern is not default, it means we passed some custom list of the changed specs
    // so we need to calculate how many chunks we need to run
    const matchingSpecsCount = inputSpecs.split(",").length;
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  const specFn = isDefaultSpecPattern
    ? () => matchedSpecFolders
    : (index) => inputSpecs.split(",")
      // works when specs less than 5, otherwise seems all chunks will contain
      // same specs
      .slice(SPECS_PER_CHUNK * index, SPECS_PER_CHUNK * (index + 1))
      .join(",");

  const regularTests = new Array(regularChunks).fill(1).map((files, index) => ({
    name: `e2e-group-${index + 1}`,
    specs: specFn(index),
  }));

  const testSets = isDefaultSpecPattern
    ? regularTests.concat(specialTestConfigs)
    : regularTests;

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks, isDefaultSpecPattern };
}
/**
 *
 * @param {string} changedFiles comma-separate list of
 * @returns
 */
export const getRelevantSpecs = (changedFiles) => {
  const changedFilesArray = changedFiles.split("\n")
    .map(f => f.trim())
    .filter(Boolean);
  const matchedSpecFolders = e2eMatrixMap.filter(({ globs }) =>
    globs.some((pattern) =>
      changedFilesArray.some((changedFile) => minimatch(changedFile, pattern)
    )
  )).map(({ specFolder }) => specFolder).join(",");

  return matchedSpecFolders;
};

module.exports = { buildMatrix, getRelevantSpecs };
