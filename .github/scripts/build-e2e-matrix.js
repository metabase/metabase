const glob = require("glob");

function buildMatrix(inputSpecs, inputChunks) {
  const java = 21;
  const defaultRunner = "ubuntu-22.04";
  const SPECS_PER_CHUNK = 5; // number of specs per chunk when running specific specs

  const defaultOptions = {
    "java-version": java,
    runner: defaultRunner,
    edition: "ee",
  };

  const allSpecs = inputSpecs ?? "./e2e/test/scenarios/**/*.cy.spec.*";

  const isDefaultSpecPattern =
    allSpecs === "./e2e/test/scenarios/**/*.cy.spec.*";

  // Log the processed value
  console.log("Processed specs value:", allSpecs);
  console.log("Is default pattern:", isDefaultSpecPattern);

  // Helper to check if specs exist for a given pattern
  const hasMatchingSpecs = (pattern) => {
    console.log("Checking specs for pattern:", pattern);
    console.log("Matching specs:", glob.sync(pattern));
    return glob.sync(pattern).length > 0;
  };

  // Define special test configurations and filter out those without matching specs
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

  // Filter special tests based on matching specs
  const specialTests = specialTestConfigs.filter((test) =>
    hasMatchingSpecs(test.specs),
  );

  let regularChunks;
  if (isDefaultSpecPattern) {
    // For default pattern, use input chunks minus special tests
    regularChunks = inputChunks - specialTests.length;
  } else {
    // For specific specs, calculate based on number of matching files
    const matchingSpecsCount = hasMatchingSpecs(allSpecs);
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  // Create regular test chunks
  const regularTests = new Array(regularChunks).fill(1).map((files, index) => ({
    name: `e2e-group-${index + 1}`,
    ...(!isDefaultSpecPattern && { specs: allSpecs }),
  }));

  // Combine regular and special tests if special tests exist
  const testSets =
    specialTests.length > 0 ? [...regularTests, ...specialTests] : regularTests;

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks };
}

module.exports = { buildMatrix };
