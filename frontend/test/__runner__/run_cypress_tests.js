const { printBold } = require("./cypress-runner-utils");
const runCypress = require("./cypress-runner-run-tests");
const getVersion = require("./cypress-runner-get-version");
const generateSnapshots = require("./cypress-runner-generate-snapshots");

// Use require for BackendResource to run it after the mock afterAll has been set
const BackendResource = require("./backend.js").BackendResource;

const server = BackendResource.get({ dbKey: "" });
const baseUrl = server.host;

const init = async () => {
  printBold("Metabase version info");
  await getVersion();

  printBold("Starting backend");
  await BackendResource.start(server);

  printBold("Generating snapshots");
  await generateSnapshots(baseUrl, cleanup);

  printBold("Starting Cypress");
  await runCypress(baseUrl, cleanup);
};

const cleanup = async (exitCode = 0) => {
  printBold("Cleaning up...");
  await BackendResource.stop(server);
  process.exit(exitCode);
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
