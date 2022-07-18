const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const fetch = require("isomorphic-fetch");

const { printBold } = require("./cypress-runner-utils");
const runCypress = require("./cypress-runner-run-tests");
const getVersion = require("./cypress-runner-get-version");
const generateSnapshots = require("./cypress-runner-generate-snapshots");

const getDbFile = () =>
  path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

const server = {
  dbFile: __dirname + getDbFile(),
};

async function isReady(host) {
  try {
    const response = await fetch(`${host}/api/health`);
    if (response.status === 200) {
      return true;
    }
  } catch (e) {}
  return false;
}

const init = async () => {
  printBold("Metabase version info");
  await getVersion();

  const port = 4000;
  server.port = port;
  server.host = `http://localhost:${port}`;
  printBold(`Starting backend: ${server.host}`);
  server.process = spawn(
    "java",
    [
      "-XX:+IgnoreUnrecognizedVMOptions", // ignore options not recognized by this Java version (e.g. Java 8 should ignore Java 9 options)
      "-Dh2.bindAddress=localhost", // fix H2 randomly not working (?)
      // "-Xmx2g", // Hard limit of 2GB size for the heap since Circle is dumb and the JVM tends to go over the limit
      "-Djava.awt.headless=true", // when running on macOS prevent little Java icon from popping up in Dock
      "-Duser.timezone=US/Pacific",
      `-Dlog4j.configurationFile=file:${__dirname}/log4j2.xml`,
      "-jar",
      "target/uberjar/metabase.jar",
    ],
    {
      env: {
        MB_DB_TYPE: "h2",
        MB_DB_FILE: server.dbFile,
        MB_JETTY_HOST: "0.0.0.0",
        MB_JETTY_PORT: server.port,
        MB_ENABLE_TEST_ENDPOINTS: "true",
        MB_PREMIUM_EMBEDDING_TOKEN:
          (process.env["MB_EDITION"] === "ee" &&
            process.env["ENTERPRISE_TOKEN"]) ||
          undefined,
        MB_FIELD_FILTER_OPERATORS_ENABLED: "true",
        MB_USER_DEFAULTS: JSON.stringify({
          token: "123456",
          user: {
            first_name: "Testy",
            last_name: "McTestface",
            email: "testy@metabase.test",
            site_name: "Epic Team",
          },
        }),
        MB_SNOWPLOW_AVAILABLE: process.env["MB_SNOWPLOW_AVAILABLE"],
        MB_SNOWPLOW_URL: process.env["MB_SNOWPLOW_URL"],
        PATH: process.env.PATH,
      },
      stdio:
        process.env["DISABLE_LOGGING"] || process.env["DISABLE_LOGGING_BACKEND"]
          ? "ignore"
          : "inherit",
    },
  );

  if (!(await isReady(server.host))) {
    console.log(
      `Waiting for backend (host=${server.host} dbFile=${server.dbFile}...`,
    );
    while (!(await isReady(server.host))) {
      if (!process.env["CI"]) {
        // disable for CI since it break's CircleCI's no_output_timeout
        console.log(".");
      }
      await delay(500);
    }
    console.log("\n");
  }
  console.log(`Backend ready (host=${server.host} dbFile=${server.dbFile}`);

  printBold("Generating snapshots");
  await generateSnapshots(server.host, cleanup);

  printBold("Starting Cypress");
  await runCypress(server.host, cleanup);
};

const cleanup = async (exitCode = 0) => {
  printBold("Cleaning up...");
  if (server.process) {
    server.process.kill("SIGKILL");
    console.log(`Stopped backend (host=${server.host} dbFile=${server.dbFile}`);
  }
  try {
    if (server.dbFile) {
      fs.unlinkSync(`${server.dbFile}.mv.db`);
    }
  } catch (e) {}

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

// Copied here from `frontend/src/metabase/lib/promise.js` to decouple Cypress from Typescript
function delay(duration) {
  return new Promise((resolve, reject) => setTimeout(resolve, duration));
}
