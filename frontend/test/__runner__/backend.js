#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const fetch = require("isomorphic-fetch");

const generateTempDbPath = () =>
  path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

const port = 4000;

const BackendResource = createSharedResource("BackendResource", {
  create({ dbKey }) {
    const dbFile = generateTempDbPath();
    const absoluteDbKey = dbKey ? __dirname + dbKey : dbFile;

    return {
      dbKey: absoluteDbKey,
      dbFile: dbFile,
      host: `http://localhost:${port}`,
      port: port,
    };
  },
  async start(server) {
    if (!server.process) {
      if (server.dbKey !== server.dbFile) {
        fs.copyFileSync(`${server.dbKey}.mv.db`, `${server.dbFile}.mv.db`);
      }

      const javaFlags = [
        "-XX:+IgnoreUnrecognizedVMOptions", // ignore options not recognized by this Java version (e.g. Java 8 should ignore Java 9 options)
        "-Dh2.bindAddress=localhost", // fix H2 randomly not working (?)
        "-Djava.awt.headless=true", // when running on macOS prevent little Java icon from popping up in Dock
        "-Duser.timezone=US/Pacific",
        `-Dlog4j.configurationFile=file:${__dirname}/log4j2.xml`,
      ];

      const metabaseConfig = {
        MB_DB_TYPE: "h2",
        MB_DB_FILE: server.dbFile,
        MB_JETTY_HOST: "0.0.0.0",
        MB_JETTY_PORT: server.port,
        MB_ENABLE_TEST_ENDPOINTS: "true",
        MB_PREMIUM_EMBEDDING_TOKEN:
          (process.env["MB_EDITION"] === "ee" &&
            process.env["ENTERPRISE_TOKEN"]) ||
          undefined,
      };

      /**
       * This ENV is used for Cloud instances only, and is subject to change.
       * As such, it is not documented anywhere in the code base!
       *
       * WARNING:
       * Changing values here will break the related E2E test.
       */
      const userDefaults = {
        MB_USER_DEFAULTS: JSON.stringify({
          token: "123456",
          user: {
            first_name: "Testy",
            last_name: "McTestface",
            email: "testy@metabase.test",
            site_name: "Epic Team",
          },
        }),
      };

      const snowplowConfig = {
        MB_SNOWPLOW_AVAILABLE: process.env["MB_SNOWPLOW_AVAILABLE"],
        MB_SNOWPLOW_URL: process.env["MB_SNOWPLOW_URL"],
      };

      server.process = spawn(
        "java",
        [...javaFlags, "-jar", "target/uberjar/metabase.jar"],
        {
          env: {
            ...metabaseConfig,
            ...userDefaults,
            ...snowplowConfig,
            PATH: process.env.PATH,
          },
          stdio:
            process.env["DISABLE_LOGGING"] ||
            process.env["DISABLE_LOGGING_BACKEND"]
              ? "ignore"
              : "inherit",
        },
      );
    }
    if (!(await isReady(server.host))) {
      process.stdout.write(
        "Waiting for backend (host=" +
          server.host +
          " dbKey=" +
          server.dbKey +
          ")",
      );
      while (!(await isReady(server.host))) {
        if (!process.env["CI"]) {
          // disable for CI since it break's CircleCI's no_output_timeout
          process.stdout.write(".");
        }
        await delay(500);
      }
      process.stdout.write("\n");
    }
    console.log(
      "Backend ready (host=" + server.host + " dbKey=" + server.dbKey + ")",
    );
  },
  async stop(server) {
    if (server.process) {
      server.process.kill("SIGKILL");
      console.log(
        "Stopped backend (host=" + server.host + " dbKey=" + server.dbKey + ")",
      );
    }
    try {
      if (server.dbFile) {
        fs.unlinkSync(`${server.dbFile}.mv.db`);
      }
    } catch (e) {}
  },
});

async function isReady(host) {
  try {
    const response = await fetch(`${host}/api/health`);
    if (response.status === 200) {
      return true;
    }
  } catch (e) {}
  return false;
}

function createSharedResource(
  resourceName,
  { defaultOptions, create, start, stop },
) {
  const entriesByKey = new Map();
  const entriesByResource = new Map();

  function kill(entry) {
    if (entriesByKey.has(entry.key)) {
      entriesByKey.delete(entry.key);
      entriesByResource.delete(entry.resource);
      const p = stop(entry.resource).then(null, err =>
        console.log("Error stopping resource", resourceName, entry.key, err),
      );
      return p;
    }
  }

  return {
    get(options = defaultOptions) {
      const dbKey = options;
      const key = dbKey || {};
      let entry = entriesByKey.get(key);
      if (!entry) {
        entry = {
          key: key,
          references: 0,
          resource: create(options),
        };
        entriesByKey.set(entry.key, entry);
        entriesByResource.set(entry.resource, entry);
      }
      ++entry.references;
      return entry.resource;
    },
    async start(resource) {
      const entry = entriesByResource.get(resource);
      return start(entry.resource);
    },
    async stop(resource) {
      const entry = entriesByResource.get(resource);
      if (entry && --entry.references <= 0) {
        await kill(entry);
      }
    },
  };
}

// Copied here from `frontend/src/metabase/lib/promise.js` to decouple Cypress from Typescript
function delay(duration) {
  return new Promise((resolve, reject) => setTimeout(resolve, duration));
}

module.exports = BackendResource;
