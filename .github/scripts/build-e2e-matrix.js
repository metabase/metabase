function buildMatrix(inputSpecs, inputChunks) {
  const java = 21;
  const defaultRunner = "ubuntu-22.04";

  const defaultOptions = {
    "java-version": java,
    runner: defaultRunner,
    edition: "ee",
  };

  const allSpecs = inputSpecs ?? "./e2e/test/scenarios/**/*.cy.spec.*";

  // see config.js function getSplittableSpecs for logic that excludes some tests from auto splitting
  const specialTests = [
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

  const regularChunks = inputChunks - specialTests.length;

  const regularTests = new Array(regularChunks).fill(1).map((files, index) => ({
    name: `e2e-group-${index + 1}`,
  }));

  // regular chunks need to come before special chunks
  const testSets = [...regularTests, ...specialTests];

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return { config, regularChunks };
}

module.exports = { buildMatrix };
