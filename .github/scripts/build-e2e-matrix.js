const glob = require("glob");

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

  const allSpecs = inputSpecs || "./e2e/test/scenarios/**/*.cy.spec.*";

  const isDefaultSpecPattern =
    allSpecs === "./e2e/test/scenarios/**/*.cy.spec.*";

  console.log("Processed specs value:", allSpecs);
  console.log("Is default pattern:", isDefaultSpecPattern);

  const getMatchingSpecsCount = (pattern) => glob.sync(pattern).length;
  const hasMatchingSpecs = (pattern) => {
    console.log("Checking specs for pattern:", pattern);
    console.log("Matching specs:", glob.sync(pattern));
    return getMatchingSpecsCount(pattern) > 0;
  };

  const specialTestConfigs = [
    {
      name: "embedding-sdk",
      specs: "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*",
    },
    {
      name: "oss-subset",
      edition: "oss",
      tags: "@OSS @smoke+-@EE",
      specs: allSpecs,
    },
    { name: "mongo", tags: "@mongo", specs: allSpecs },
  ];

  const specialTests = specialTestConfigs.filter((test) =>
    hasMatchingSpecs(test.specs),
  );

  let regularChunks;
  if (isDefaultSpecPattern) {
    regularChunks = inputChunks - specialTests.length;
  } else {
    // For specific specs, calculate based on number of matching files
    const matchingSpecsCount = getMatchingSpecsCount(allSpecs);
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  const regularTests = new Array(regularChunks).fill(1).map((files, index) => ({
    name: `e2e-group-${index + 1}`,
    ...(!isDefaultSpecPattern && { specs: allSpecs }),
  }));

  const testSets = regularTests.concat(specialTests);

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks };
}

module.exports = { buildMatrix };
