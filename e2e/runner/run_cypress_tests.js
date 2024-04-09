const CypressBackend = require("./cypress-runner-backend");
const generateSnapshots = require("./cypress-runner-generate-snapshots");
const getVersion = require("./cypress-runner-get-version");
const runCypress = require("./cypress-runner-run-tests");
const { printBold } = require("./cypress-runner-utils");

const e2eHost = process.env["E2E_HOST"];

const server = CypressBackend.createServer();
const baseUrl = e2eHost || server.host;

const init = async () => {
  if (!e2eHost) {
    printBold("Metabase version info");
    await getVersion();

    printBold("Starting backend");
    await CypressBackend.start(server);

    printBold("Generating snapshots");
    await generateSnapshots(baseUrl, cleanup);
  }

  printBold("Starting Cypress");
  await runCypress(baseUrl, cleanup);
};

const cleanup = async (exitCode = 0) => {
  if (!e2eHost) {
    printBold("Cleaning up...");
    await CypressBackend.stop(server);
  }

  // We might get a signal code instead, which is a string
  // and doesn't require process.exit call
  if (typeof exitCode === "number") {
    process.exit(exitCode);
  }
};

const launch = () =>
  init()
    .then(cleanup)
    .catch(e => {
      console.error(e);
      cleanup(1);
    });

launch();

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
