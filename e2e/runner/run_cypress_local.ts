import CypressBackend from "./cypress-runner-backend";
import runCypress from "./cypress-runner-run-tests";
import {
  booleanify,
  printBold,
  shell,
  unBooleanify,
} from "./cypress-runner-utils";

// if you want to change these, set them as environment variables in your shell
const userOptions = {
  TEST_SUITE: "e2e", // e2e | component
  MB_EDITION: "ee", // ee | oss
  ENTERPRISE_TOKEN: "",
  START_CONTAINERS: true,
  STOP_CONTAINERS: false,
  BACKEND_PORT: 4000,
  OPEN_UI: true,
  SHOW_BACKEND_LOGS: false,
  GENERATE_SNAPSHOTS: true,
  QUIET: false,
  ...booleanify(process.env),
};

const derivedOptions = {
  CYPRESS_ALL_FEATURES_TOKEN: userOptions.ENTERPRISE_TOKEN,
  QA_DB_ENABLED: userOptions.START_CONTAINERS,
  BUILD_JAR: userOptions.BACKEND_PORT === 4000,
  CYPRESS_IS_EMBEDDING_SDK: userOptions.TEST_SUITE === "component",
  MB_SNOWPLOW_AVAILABLE: userOptions.START_CONTAINERS,
  MB_SNOWPLOW_URL: "http://localhost:9090",
};

const options = {
  ...derivedOptions,
  ...userOptions,
};

process.env = unBooleanify(options);

if (options.MB_EDITION === "ee" && !options.ENTERPRISE_TOKEN) {
  printBold(
    "⚠️ ENTERPRISE_TOKEN is not set. Either set it or run with MB_EDITION=oss",
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
        "⚠️ Your backend is already running, you may want to kill pid " +
          isBackendRunning,
      );
      process.exit(1);
    }

    printBold("⏳ Starting backend");
    await CypressBackend.start();
  } else {
    printBold(
      `Not building a jar, expecting metabase to be running on port ${options.BACKEND_PORT}. Make sure your metabase instance is running with an h2 app db and the following environment variables:
  - MB_ENABLE_TEST_ENDPOINTS=true
  - MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE=true
    `,
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
      "⚠️⚠️ You don't have your frontend running. You should probably run yarn build-hot ⚠️⚠️",
    );
  }

  printBold("⏳ Starting Cypress");
  await runCypress(options.TEST_SUITE, cleanup);
};

const cleanup = async (exitCode: string | number = 0) => {
  if (options.BUILD_JAR) {
    printBold("⏳ Cleaning up...");
    await CypressBackend.stop();
  }

  if (options.STOP_CONTAINERS) {
    printBold("⏳ Stopping containers");
    shell("docker compose -f ./e2e/test/scenarios/docker-compose.yml down");
  }

  typeof exitCode === "number" ? process.exit(exitCode) : process.exit(0);
};

init()
  .then(() => cleanup(0))
  .catch(e => {
    console.error(e);
    cleanup(1);
  });

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
