const { setupContainer } = require("./setup-container.js");
const { runCommand } = require("./utils");

const command = process.argv[2];
const isCI = process.env["CYPRESS_CI"] === "true";

const baseEnv = {
  CYPRESS_IS_VISUAL_TEST: "true",
  MB_EDITION: process.env.MB_EDITION,
  CYPRESS_ALL_FEATURES_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN,
  CYPRESS_NO_FEATURES_TOKEN: process.env.CYPRESS_NO_FEATURES_TOKEN,
};
const cypressFlags = [
  "--browser=/usr/bin/chromium",
  '--env grepTags="@visual",grepOmitFiltered=true',
].join(" ");

const optionsByCommand = {
  "cypress-run": {
    env: baseEnv,
    prepare: isCI ? null : "yarn test-cypress:build",
    command: isCI
      ? `node e2e/runner/run_cypress_ci.js test ${cypressFlags}`
      : `yarn test-cypress-run ${cypressFlags}`,
  },
  "cypress-run-component-sdk": {
    env: baseEnv,
    command: `yarn test-cypress-run-component-sdk ${cypressFlags}`,
  },
  "cypress-update": {
    env: {
      ...baseEnv,
      CYPRESS_DO_NOT_FAIL: "true",
    },
    prepare: isCI ? null : "yarn test-cypress:build",
    command: `yarn test-cypress-run ${cypressFlags}`,
  },
  "cypress-update-component-sdk": {
    env: {
      ...baseEnv,
      CYPRESS_DO_NOT_FAIL: "true",
    },
    command: `yarn test-cypress-run-component-sdk ${cypressFlags}`,
  },
};

async function runCypressVisualTests() {
  const options = optionsByCommand[command];

  if (options.prepare) {
    const [command, ...args] = options.prepare.split(" ");

    await runCommand(command, args);
  }

  await setupContainer(options);
}

runCypressVisualTests();
