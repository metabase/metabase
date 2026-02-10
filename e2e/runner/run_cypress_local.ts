import fs from "fs";
import os from "os";
import path from "path";

import { BACKEND_PORT } from "./constants/backend-port";
import { FAILURE_EXIT_CODE, SUCCESS_EXIT_CODE } from "./constants/exit-code";
import runCypress from "./cypress-node-js-runner";
import CypressBackend from "./cypress-runner-backend";
import {
  booleanify,
  parseArguments,
  printBold,
  shell,
  unBooleanify,
} from "./cypress-runner-utils";
import { startHostAppContainers } from "./embedding-sdk/host-apps/start-host-app-containers";
import { startSampleAppContainers } from "./embedding-sdk/sample-apps/start-sample-app-containers";
import { resolveSdkE2EConfig } from "./resolve-sdk-e2e-config";

let tempSampleDBDir: string | null = null;

// if you want to change these, set them as environment variables in your shell
const userOptions = {
  CYPRESS_TESTING_TYPE: "e2e", // e2e | component
  SDK_TEST_SUITE: undefined, // one of the many sample-app, or host-app Embedding SDK suites
  MB_EDITION: "ee", // ee | oss
  START_CONTAINERS: true,
  STOP_CONTAINERS: false,
  BACKEND_PORT: BACKEND_PORT, // override with MB_JETTY_PORT in your env
  OPEN_UI: true,
  SHOW_BACKEND_LOGS: false,
  GENERATE_SNAPSHOTS: true,
  QUIET: false,
  TZ: "UTC",
  ...booleanify(process.env),
};

const derivedOptions = {
  QA_DB_ENABLED: userOptions.START_CONTAINERS,
  BUILD_JAR: userOptions.BACKEND_PORT === 4000,
  START_BACKEND: userOptions.BACKEND_PORT === 4000,
  MB_SNOWPLOW_AVAILABLE: true,
  MB_SNOWPLOW_URL: "http://localhost:9090",
};

const options = {
  ...derivedOptions,
  ...userOptions,
};

process.env = unBooleanify(options);

const missingTokens = [
  "MB_ALL_FEATURES_TOKEN",
  "MB_STARTER_CLOUD_TOKEN",
  "MB_PRO_CLOUD_TOKEN",
  "MB_PRO_SELF_HOSTED_TOKEN",
].filter((token) => !process.env[token]);

if (options.MB_EDITION === "ee" && missingTokens.length > 0) {
  printBold(
    `⚠️ Missing tokens: ${missingTokens.join(", ")}. Either set them or run with MB_EDITION=oss`,
  );
  process.exit(FAILURE_EXIT_CODE);
}

printBold(`Running Cypress with options:
  - CYPRESS_TESTING_TYPE : ${options.CYPRESS_TESTING_TYPE}
  - SDK_TEST_SUITE       : ${options.SDK_TEST_SUITE}
  - MB_EDITION           : ${options.MB_EDITION}
  - START_CONTAINERS     : ${options.START_CONTAINERS}
  - STOP_CONTAINERS      : ${options.STOP_CONTAINERS}
  - BUILD_JAR            : ${options.BUILD_JAR}
  - GENERATE_SNAPSHOTS   : ${options.GENERATE_SNAPSHOTS}
  - BACKEND_PORT         : ${options.BACKEND_PORT}
  - START_BACKEND        : ${options.START_BACKEND}
  - OPEN_UI              : ${options.OPEN_UI}
  - SHOW_BACKEND_LOGS    : ${options.SHOW_BACKEND_LOGS}
  - TZ                   : ${options.TZ}
`);

const init = async () => {
  const cliArguments = process.argv.slice(2);
  const userOverrides = await parseArguments(cliArguments);

  if (options.START_CONTAINERS) {
    printBold("⏳ Starting containers");
    shell("docker compose -f ./e2e/test/scenarios/docker-compose.yml up -d");
  }

  if (options.BUILD_JAR) {
    printBold("⏳ Building backend");
    shell("./bin/build-for-test");

    if (options.START_BACKEND) {
      const isBackendRunning = shell(
        `lsof -ti:${options.BACKEND_PORT} || echo ""`,
        { quiet: true },
      );
      if (isBackendRunning) {
        printBold(
          "⚠️ Your backend is already running, you may want to kill pid " +
            isBackendRunning,
        );
        process.exit(FAILURE_EXIT_CODE);
      }

      // Use a temporary copy of the sample db so it won't use and lock the db used for local development
      tempSampleDBDir = path.join(
        os.tmpdir(),
        `metabase-sample-db-e2e-${process.pid}`,
      );
      fs.mkdirSync(tempSampleDBDir, { recursive: true });
      process.env.MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR = tempSampleDBDir;

      printBold("⏳ Starting backend");
      await CypressBackend.start();
    }
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

    printBold("⏳ Generating app db snapshots");
    process.env.OPEN_UI = "false";
    await runCypress(
      { configFile: "e2e/support/cypress-snapshots.config.js" },
      cleanup,
    );
    process.env.OPEN_UI = `${options.OPEN_UI}`;
  } else {
    printBold("Skipping snapshot generation, beware of stale snapshot caches");
    shell("echo 'Existing snapshots:' && ls -1 e2e/snapshots");
  }

  const isFrontendRunning = shell("lsof -ti:8080 || echo ''", { quiet: true });
  if (!isFrontendRunning && options.CYPRESS_TESTING_TYPE === "e2e") {
    printBold(
      "⚠️⚠️ You don't have your frontend running. You should probably run bun run build-hot ⚠️⚠️",
    );
  }

  if (options.SDK_TEST_SUITE) {
    switch (options.SDK_TEST_SUITE) {
      case "metabase-nodejs-react-sdk-embedding-sample-e2e":
      case "metabase-nextjs-sdk-embedding-sample-e2e":
      case "shoppy-e2e":
        await startSampleAppContainers(options.SDK_TEST_SUITE);
        break;

      case "vite-6-host-app-e2e":
      case "next-15-app-router-host-app-e2e":
      case "next-15-pages-router-host-app-e2e":
      case "angular-20-host-app-e2e":
        await startHostAppContainers(options.SDK_TEST_SUITE);
        break;
    }

    printBold("⏳ Starting Sample/Host App Cypress Tests");
    const config = resolveSdkE2EConfig(options.SDK_TEST_SUITE);
    await runCypress(config, cleanup);
  }

  if (options.CYPRESS_TESTING_TYPE === "component") {
    printBold("⏳ Starting Cypress SDK component tests");
    await runCypress(
      {
        configFile:
          "e2e/support/cypress-embedding-sdk-component-test.config.js",
        testingType: "component",
      },
      cleanup,
    );
  }

  if (options.CYPRESS_TESTING_TYPE === "e2e") {
    const config = { configFile: "e2e/support/cypress.config.js" };

    printBold("⏳ Starting Cypress");
    await runCypress({ ...config, ...userOverrides }, cleanup);
  }
};

const cleanup = async (exitCode: string | number = SUCCESS_EXIT_CODE) => {
  if (options.BUILD_JAR) {
    printBold("⏳ Cleaning up...");
    await CypressBackend.stop();
  }

  // Add cleanup for the temporary sample database directory
  if (tempSampleDBDir) {
    try {
      fs.rmSync(tempSampleDBDir, { recursive: true, force: true });
      printBold(
        `🗑️ Cleaned up temporary sample database directory: ${tempSampleDBDir}`,
      );
    } catch (e) {
      console.error(
        `Error cleaning up temporary sample database directory: ${e}`,
      );
    }
  }

  if (options.STOP_CONTAINERS) {
    printBold("⏳ Stopping containers");
    shell("docker compose -f ./e2e/test/scenarios/docker-compose.yml down");
  }

  typeof exitCode === "number"
    ? process.exit(exitCode)
    : process.exit(SUCCESS_EXIT_CODE);
};

init()
  .then(() => cleanup(SUCCESS_EXIT_CODE))
  .catch((e) => {
    console.error(e);
    cleanup(FAILURE_EXIT_CODE);
  });

process.on("exit", cleanup);
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
