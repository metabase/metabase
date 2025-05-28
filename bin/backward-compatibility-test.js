#!/usr/bin/env node
/* eslint-disable no-console */
/* global process */

const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const INSTRUCTIONS =
  "Usage: node bin/backward-compatibility-test.js <FE_GIT_REF> <BE_GIT_REF> <build|start|test> <?optional shard in format shard/total>";

const args = process.argv.slice(2);
if (args.length !== 3 && args.length !== 4) {
  console.log(INSTRUCTIONS);
  process.exit(1);
}

const FE_GIT_REF = args[0];
const BE_GIT_REF = args[1];
const COMMAND = args[2];
const SHARD_ARG = args[3];

const TMP_FOLDER = path.join(process.cwd(), ".tmp");
const FE_FOLDER = path.join(TMP_FOLDER, "metabase-fe");
const BE_FOLDER = path.join(TMP_FOLDER, "metabase-be");
const JAR_PATH = path.join(BE_FOLDER, "target/uberjar/metabase.jar");

const getTestFiles = () => {
  const questionFiles = getFilesInsideFolder(
    path.join(FE_FOLDER, "e2e/test/scenarios/question"),
  ).map((file) => path.join("e2e/test/scenarios/question", file)); // make sure the path is how we expect, starting with "e2e/test..."

  return [
    "e2e/test/scenarios/dashboard/dashboard.cy.spec.js",
    ...questionFiles,
  ].filter((file) => !SKIPPED_FILES.includes(file));
};

// place to put files if we want to skip them
const SKIPPED_FILES = [];

console.log(`Using frontend from ${FE_GIT_REF}`);
console.log(`Using backend from ${BE_GIT_REF}`);
console.log("---");
console.log("To test locally run:");
console.log(
  `node bin/backward-compatibility-test.js ${FE_GIT_REF} ${BE_GIT_REF} <build|start|test>`,
);
console.log("---");
console.log(`TMP_FOLDER: ${TMP_FOLDER}`);
console.log(`FE_FOLDER: ${FE_FOLDER}`);
console.log(`BE_FOLDER: ${BE_FOLDER}`);
console.log(`JAR_PATH: ${JAR_PATH}`);

function printStep(message) {
  console.log("---");
  console.log(message);
  console.log("---");
}

function executeCommand(command, cwd, envOverrides = {}) {
  console.log(`Executing: ${command}${cwd ? " in " + cwd : ""}`);
  try {
    execSync(command, {
      stdio: "inherit",
      cwd: cwd,
      env: { ...process.env, ...envOverrides },
    });
  } catch (error) {
    console.error(`Failed to execute command: ${command}`);
    process.exit(1);
  }
}

function build() {
  printStep("Cleaning up tmp folder...");
  fs.rmSync(TMP_FOLDER, { recursive: true, force: true });
  fs.mkdirSync(TMP_FOLDER, { recursive: true });
  fs.writeFileSync(path.join(TMP_FOLDER, ".gitignore"), "*");

  printStep("Cloning frontend...");
  executeCommand(
    `git clone --depth 1 -b "${FE_GIT_REF}" https://github.com/metabase/metabase.git "${FE_FOLDER}"`,
  );

  printStep("Cloning backend...");
  executeCommand(
    `git clone --depth 1 -b "${BE_GIT_REF}" https://github.com/metabase/metabase.git "${BE_FOLDER}"`,
  );

  console.log("Building frontend...");
  executeCommand("yarn install", FE_FOLDER);
  executeCommand("yarn build-release", FE_FOLDER, {
    MB_EDITION: "ee",
  });

  printStep("Copying frontend build to backend...");
  const feResourcesClientPath = path.join(
    FE_FOLDER,
    "resources",
    "frontend_client",
  );
  const feResourcesSharedPath = path.join(
    FE_FOLDER,
    "resources",
    "frontend_shared",
  );

  const beResourcesPath = path.join(BE_FOLDER, "resources");

  const beTargetClientPath = path.join(beResourcesPath, "frontend_client");
  const beTargetSharedPath = path.join(beResourcesPath, "frontend_shared");

  fs.cpSync(feResourcesClientPath, beTargetClientPath, {
    recursive: true,
    force: true,
  });
  fs.cpSync(feResourcesSharedPath, beTargetSharedPath, {
    recursive: true,
    force: true,
  });

  printStep("Building uberjar...");
  const buildUberjarCommand =
    "clojure -X:drivers:build:build/all :steps '[:version :translations :drivers :uberjar]'";
  executeCommand(buildUberjarCommand, BE_FOLDER, { MB_EDITION: "ee" });
}

function start() {
  printStep("Starting the uberjar...");

  const dbFile = path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

  const cypressToken = process.env.CYPRESS_ALL_FEATURES_TOKEN;
  if (typeof cypressToken === "undefined") {
    console.error(
      "Error: CYPRESS_ALL_FEATURES_TOKEN environment variable is not set. This is required for the 'start' command.",
    );
    process.exit(1);
  }

  const javaEnv = {
    MB_DB_FILE: dbFile,
    MB_CONFIG_FILE_PATH: "",
    MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE: "true",
    MB_ENABLE_TEST_ENDPOINTS: "true",
    MB_PREMIUM_EMBEDDING_TOKEN: cypressToken,
    MB_JETTY_PORT: "4000",
  };
  executeCommand(`java -jar "${JAR_PATH}"`, process.cwd(), javaEnv);
}

async function checkBackendHealth() {
  try {
    const response = await fetch("http://localhost:4000/api/health");
    if (response.ok) {
      const data = await response.json();
      return data.status === "ok";
    }
  } catch (error) {
    return false;
  }
  return false;
}

async function waitForBackend() {
  printStep("Waiting for backend to be ready...");
  let attempts = 0;
  const maxAttempts = 120; // wait at most ~2 minutes
  while (attempts < maxAttempts) {
    if (await checkBackendHealth()) {
      printStep("Backend is ready");
      return;
    }
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error("Backend did not become ready after 2 minutes.");
  process.exit(1);
}

async function test() {
  const { shard, totalShards, testForThisShard } = getTestShardInfo();

  console.log(
    `Shard ${shard} of ${totalShards} running tests:\n${testForThisShard.join(
      "\n",
    )}`,
  );

  await waitForBackend();

  printStep("Creating snapshot...");
  executeCommand("node e2e/runner/run_cypress_ci.js snapshot", FE_FOLDER);

  printStep("Running tests...");
  const testEnv = {
    BACKEND_PORT: "4000",
    TEST_SUITE: "e2e",
    // uncomment the line above to debug the tests with the ui
    // OPEN_UI: "true",
  };

  const cypressCommand = `node e2e/runner/run_cypress_ci.js e2e --env grepTags="--@flaky --@OSS --@external",grepOmitFiltered=true --spec "${testForThisShard.join(",")}"`;
  executeCommand(cypressCommand, FE_FOLDER, testEnv);
}

const getTestShardInfo = () => {
  const testFiles = getTestFiles();

  if (!SHARD_ARG) {
    return {
      shard: 1,
      totalShards: 1,
      testForThisShard: testFiles,
    };
  }

  const totalShards = SHARD_ARG.split("/")[1];
  const shard = SHARD_ARG.split("/")[0];
  const testForThisShard = testFiles.filter(
    (_test, i) => i % totalShards === shard - 1,
  );

  return {
    shard,
    totalShards,
    testForThisShard,
  };
};

function getFilesInsideFolder(folder) {
  return fs.readdirSync(folder); //.map((file) => path.join(folder, file));
}

// main logic
(async () => {
  try {
    switch (COMMAND) {
      case "build":
        build();
        break;
      case "start":
        start();
        break;
      case "test":
        await test();
        break;
      default:
        console.log(INSTRUCTIONS);
        process.exit(1);
    }
  } catch (error) {
    console.error(
      "An unexpected error occurred during script execution:",
      error,
    );
    process.exit(1);
  }
})();
