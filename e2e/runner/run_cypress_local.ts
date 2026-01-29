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

// if you want to change these, set them as environment variables in your shell
const options = {
  MB_EDITION: "ee", // ee | oss
  CYPRESS_TESTING_TYPE: "e2e", // e2e | component
  CYPRESS_GUI: true,
  GENERATE_SNAPSHOTS: true,
  JAR_PATH: undefined,
  ...booleanify(process.env),
  // If this token is present in your env when Cypress runs, it's a mistake.
  // Cypress needs to start from a clean slate in order to set the token programmatically.
  MB_PREMIUM_EMBEDDING_TOKEN: undefined,
};

process.env = unBooleanify(options);

const missingTokens = [
  "CYPRESS_MB_ALL_FEATURES_TOKEN",
  "CYPRESS_MB_STARTER_CLOUD_TOKEN",
  "CYPRESS_MB_PRO_CLOUD_TOKEN",
  "CYPRESS_MB_PRO_SELF_HOSTED_TOKEN",
].filter((token) => !process.env[token]);

if (options.MB_EDITION === "ee" && missingTokens.length > 0) {
  printBold(
    `⚠️ Missing tokens: ${missingTokens.join(", ")}. Either set them or run with MB_EDITION=oss`,
  );
}

printBold(`Running Cypress with options:
  - MB_EDITION           : ${options.MB_EDITION}
  - CYPRESS_TESTING_TYPE : ${options.CYPRESS_TESTING_TYPE}
  - CYPRESS_GUI          : ${options.CYPRESS_GUI}
  - GENERATE_SNAPSHOTS   : ${options.GENERATE_SNAPSHOTS}
  - JAR_PATH             : ${options.JAR_PATH}
`);

const init = async () => {
  const cliArguments = process.argv.slice(2);
  const userOverrides = await parseArguments(cliArguments);

  const backendPid = CypressBackend.getBackendPid();
  const isBackendRunning = !!backendPid;

  const runningFromJar = !!options.JAR_PATH;

  printBold("⏳ Starting containers");
  shell("docker compose -f ./e2e/test/scenarios/docker-compose.yml up -d");

  if (runningFromJar) {
    if (isBackendRunning) {
      printBold("⚠️ Your backend is already running");
      console.log(`You wanted to test against a pre-built Metabase JAR:
        - It will spin up both the backend and the frontend for you
        - Kill the backend pid ${backendPid} and run the script again
        - Alternatively, use a different MB_JETTY_PORT in this shell and try again
        `);

      process.exit(FAILURE_EXIT_CODE);
    } else {
      printBold("⏳ Starting Metabase from a JAR");
      await CypressBackend.runFromJar(options.JAR_PATH);
    }
  } else {
    if (isBackendRunning) {
      printBold("⚠️ Your backend is already running");
      console.log(`If tests fail or if something doesn't work:
      - Kill the pid ${backendPid}
      - Run *bun run test-cypress* again
      - This will spin up the live backend with the correct settings for e2e tests
    `);
    } else {
      printBold("⏳ Starting live backend with hot reloading");
      await CypressBackend.runFromSource();
    }
  }

  if (options.GENERATE_SNAPSHOTS) {
    // reset cache
    shell("rm -f e2e/support/cypress_sample_instance_data.json");

    printBold("⏳ Generating app db snapshots");
    process.env.CYPRESS_GUI = "false";
    await runCypress({
      configFile: "e2e/support/cypress-snapshots.config.js",
      ...(options.CYPRESS_TESTING_TYPE === "component" && {
        env: { grepTags: "-@external" }, // component tests do not need QA DB snapshots for now
      }),
    });
    process.env.CYPRESS_GUI = `${options.CYPRESS_GUI}`;
  } else {
    printBold("Skipping snapshot generation, beware of stale snapshot caches");
    shell("echo 'Existing snapshots:' && ls -1 e2e/snapshots");
  }

  const isFrontendRunning = shell("lsof -ti:8080 || echo ''", { quiet: true });
  if (
    !isFrontendRunning &&
    options.CYPRESS_TESTING_TYPE === "e2e" &&
    !runningFromJar
  ) {
    printBold(
      "⚠️⚠️ You don't have your frontend running. You should probably run bun run build-hot ⚠️⚠️",
    );
  }

  if (options.CYPRESS_TESTING_TYPE === "component") {
    printBold("⏳ Starting Cypress SDK component tests");
    await runCypress({
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      testingType: "component",
    });
  }

  if (options.CYPRESS_TESTING_TYPE === "e2e") {
    const config = { configFile: "e2e/support/cypress.config.js" };

    printBold("⏳ Starting Cypress");
    await runCypress({ ...config, ...userOverrides });
  }
};

const cleanup = async (exitCode: string | number = SUCCESS_EXIT_CODE) => {
  printBold("⏳ Cleaning up...");
  await CypressBackend.stop();

  printBold(
    "🧹 Containers are running in background. If you wish to stop them, run:\n`docker compose -f ./e2e/test/scenarios/docker-compose.yml down`",
  );

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
