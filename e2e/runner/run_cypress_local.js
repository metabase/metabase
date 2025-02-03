const CypressBackend = require("./cypress-runner-backend");
const runCypress = require("./cypress-runner-run-tests");
const { printBold, shell } = require("./cypress-runner-utils");

// if you want to change these, set them as environment variables in your shell
const options = {
  TEST_SUITE: "e2e", // e2e | component
  MB_EDITION: "ee",
  ENTERPRISE_TOKEN: null,
  START_CONTAINERS: true,
  STOP_CONTAINERS: false,
  GENERATE_SNAPSHOTS: true,
  BACKEND_PORT: 4000,
  OPEN_UI: true,
  SHOW_BACKEND_LOGS: false,
  QUIET: false,
  ...process.env,
};

process.env = {
  // derived from options
  MB_PREMIUM_EMBEDDING_TOKEN: options.ENTERPRISE_TOKEN,
  CYPRESS_ALL_FEATURES_TOKEN: options.ENTERPRISE_TOKEN,
  QA_DB_ENABLED: options.START_CONTAINERS,
  MB_SNOWPLOW_AVAILABLE: options.START_CONTAINERS,
  BUILD_JAR: process.env.BACKEND_PORT !== 4000,
  MB_SNOWPLOW_URL: "http://localhost:9090",
  CYPRESS_IS_EMBEDDING_SDK: options.TEST_SUITE === "component",
  ...options,
};

if (options.MB_EDITION === "ee" && !options.ENTERPRISE_TOKEN) {
  console.error(
    "ENTERPRISE_TOKEN is not set. Either set it or run with MB_EDITION=oss",
  );
  process.exit(1);
}

printBold(`Running Cypress with options:
  - TEST_SUITE         : ${options.TEST_SUITE}
  - MB_EDITION         : ${options.MB_EDITION}
  - ENTERPRISE_TOKEN   : ${options.ENTERPRISE_TOKEN ? "present" : "<missing>"}
  - START_CONTAINERS   : ${options.START_CONTAINERS}
  - STOP_CONTAINERS    : ${options.STOP_CONTAINERS}
  - BUILD_JAR          : ${options.BUILD_JAR}
  - GENERATE_SNAPSHOTS : ${options.GENERATE_SNAPSHOTS}
  - BACKEND_PORT       : ${options.BACKEND_PORT}
  - OPEN_UI            : ${options.OPEN_UI}
  - SHOW_BACKEND_LOGS  : ${options.SHOW_BACKEND_LOGS}
`);

const init = async () => {
  if (options.TEST_SUITE === "component") {
    printBold("⏳ Building embedding SDK");
    shell("yarn build-embedding-sdk");
  }

  if (options.START_CONTAINERS) {
    printBold("⏳ Starting containers");
    shell("docker compose -f ./e2e/test/scenarios/docker-compose.yml up -d");
  }

  if (options.BUILD_JAR) {
    printBold("⏳ Building backend");
    shell("./bin/build-for-test");

    const isBackendRunning = shell(
      `lsof -ti:${options.BACKEND_PORT} || echo ""`,
      { quiet: true },
    );
    if (isBackendRunning) {
      printBold(
        "Your backend is already running, you may want to kill pid " +
          isBackendRunning,
      );
    }

    printBold("⏳ Starting backend");
    await CypressBackend.start();
  } else {
    printBold(
      `Not building a jar, expecting metabase to be running on port ${options.BACKEND_PORT}`,
    );
  }

  if (options.GENERATE_SNAPSHOTS) {
    // reset cache
    shell("rm -f e2e/support/cypress_sample_instance_data.json");

    printBold("⏳ Generating snapshots");
    await runCypress("snapshot", cleanup);
  }

  const isFrontendRunning = shell("lsof -ti:8080 || echo ''", { quiet: true });
  if (!isFrontendRunning && options.TEST_SUITE === "e2e") {
    printBold(
      "\n\n⚠️⚠️ You don't have your frontend running. You should probably run yarn build-hot ⚠️⚠️\n\n",
    );
  }

  printBold("⏳ Starting Cypress");
  await runCypress(options.TEST_SUITE, cleanup);
};

const cleanup = async (exitCode = 0) => {
  if (options.BUILD_JAR) {
    printBold("⏳ Cleaning up...");
    await CypressBackend.stop();
  }

  if (options.STOP_CONTAINERS) {
    printBold("⏳ Stopping containers");
    shell("docker compose ./e2e/test/scenarios/docker-compose.yml down");
  }

  // We might get a signal code instead, which is a string
  // and doesn't require process.exit call
  if (typeof exitCode === "number") {
    process.exit(exitCode);
  }
};

init()
  .then(cleanup)
  .catch(e => {
    console.error(e);
    cleanup(1);
  });

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
