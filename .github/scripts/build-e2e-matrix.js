const glob = require("glob");

const DEFAULT_SPEC_PATTERN = "./e2e/test/scenarios/**/*.cy.spec.*";
const EMBEDDING_SDK_SPEC_PATTERN =
  "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*";

/**
 *
 * @param {*} inputSpecs - specs, which were changed in the PR, separated by comma
 * .e.g e2e/test/scenarios/onboarding/command-palette.cy.spec.js,e2e/test/scenarios/question/document-title.cy.spec.js
 * or a pattern like DEFAULT_SPEC_PATTERN
 */
function buildMatrix(inputSpecs, inputChunks) {
  const java = 21;
  const defaultRunner = "ubuntu-22.04";
  // number of specs per chunk when running specific specs
  const SPECS_PER_CHUNK = 5;

  const defaultOptions = {
    "java-version": java,
    runner: defaultRunner,
    edition: "ee",
  };

<<<<<<< Updated upstream
  const allSpecs = inputSpecs || DEFAULT_SPEC_PATTERN;
  const isDefaultSpecPattern = allSpecs === DEFAULT_SPEC_PATTERN;

  console.log("Processed specs value:", allSpecs);
=======
  const isDefaultSpecPattern =
    inputSpecs === "" || inputSpecs === DEFAULT_SPEC_PATTERN;

  console.log("Processed specs value:", inputSpecs);
>>>>>>> Stashed changes
  console.log("Is default pattern:", isDefaultSpecPattern);

  const getMatchingSpecsCount = (pattern) => {
    console.log("Checking specs for pattern:", pattern);
    console.log("Matching specs:", glob.sync(pattern));

    return glob.sync(pattern).length;
  };
  const hasMatchingSpecs = (pattern) => {
    return getMatchingSpecsCount(pattern) > 0;
  };

  const specialTestConfigs = [
    {
      name: "embedding-sdk",
<<<<<<< Updated upstream
      specs: "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*",
=======
      specs: EMBEDDING_SDK_SPEC_PATTERN,
>>>>>>> Stashed changes
    },
    {
      name: "oss-subset",
      edition: "oss",
      tags: "@OSS @smoke+-@EE",
<<<<<<< Updated upstream
      specs: allSpecs,
    },
    { name: "mongo", tags: "@mongo", specs: allSpecs },
  ];

  const specialTests = specialTestConfigs.filter((test) =>
    hasMatchingSpecs(test.specs),
  );

=======
      specs: DEFAULT_SPEC_PATTERN,
    },
    { name: "mongo", tags: "@mongo", specs: DEFAULT_SPEC_PATTERN },
  ];

>>>>>>> Stashed changes
  let regularChunks;
  if (isDefaultSpecPattern) {
    regularChunks = inputChunks - specialTestConfigs.length;
  } else {
<<<<<<< Updated upstream
    // not default pattern, then it's a list of specs separated by comma
    // so we wrap it in curly braces to make it a pattern for glob
    const matchingSpecsCount = getMatchingSpecsCount(`{${allSpecs}}`);
=======
    // when pattern is not default, it means we passed some custom list of the changed specs
    // so we need to calculate how many chunks we need to run
    const matchingSpecsCount = getMatchingSpecsCount(`{${inputSpecs}}`);
>>>>>>> Stashed changes
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  const regularTests = new Array(regularChunks).fill(1).map((files, index) => ({
    name: `e2e-group-${index + 1}`,
<<<<<<< Updated upstream
    ...(!isDefaultSpecPattern && { specs: allSpecs }),
=======
    // works when specs less than 5, otherwise seems all chunks will contain
    // same specs
    ...(!isDefaultSpecPattern && {
      specs: inputSpecs
        .split(",")
        .slice(SPECS_PER_CHUNK * index, SPECS_PER_CHUNK * (index + 1))
        .join(","),
    }),
>>>>>>> Stashed changes
  }));

  const testSets = isDefaultSpecPattern
    ? regularTests.concat(specialTestConfigs)
    : regularTests;

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks };
}

const res = buildMatrix(
  "e2e/test/scenarios/onboarding/command-palette.cy.spec.js,e2e/test/scenarios/question/document-title.cy.spec.js",
  1,
);

console.log(res);

module.exports = { buildMatrix };
