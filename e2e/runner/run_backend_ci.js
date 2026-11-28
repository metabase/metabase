#!/usr/bin/env node

// Start the uberjar for CI's e2e jobs in two steps, so the job prepares everything else while Metabase starts:
//
//   node e2e/runner/run_backend_ci.js start   # start the JAR in the background and return right away
//   ...                                       # Docker containers, `bun install`, Cypress, ...
//   node e2e/runner/run_backend_ci.js wait    # wait until it's healthy; fails as soon as the JAR exits
//
// `start` runs before the front-end environment is prepared, so nothing it loads may depend on `node_modules`.
// `node e2e/runner/run_cypress_ci.js start` still does both steps at once.

const CypressBackend = require("./cypress-runner-backend");

const commands = {
  start: () => CypressBackend.startJarInBackground(),
  wait: () => CypressBackend.waitForBackgroundJar(),
};

const command = commands[process.argv[2]];

if (!command) {
  console.error(
    `Usage: run_backend_ci.js <${Object.keys(commands).join("|")}>`,
  );
  process.exit(1);
}

Promise.resolve(command()).catch((error) => {
  console.error(error);
  process.exit(1);
});
