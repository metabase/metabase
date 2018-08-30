import fs from "fs-promise";
import os from "os";
import path from "path";
import { spawn } from "child_process";

import fetch from "isomorphic-fetch";
import { delay } from "../../src/metabase/lib/promise";

export const DEFAULT_DB = __dirname + "/test_db_fixture.db";

let testDbId = 0;
const getDbFile = () =>
  path.join(os.tmpdir(), `metabase-test-${process.pid}-${testDbId++}.db`);

let port = 4000;
const getPort = () => port++;

export const BackendResource = createSharedResource("BackendResource", {
  getKey({ dbKey = DEFAULT_DB }) {
    return dbKey || {};
  },
  create({ dbKey = DEFAULT_DB }) {
    let dbFile = getDbFile();
    if (!dbKey) {
      dbKey = dbFile;
    }
    if (process.env["E2E_HOST"] && dbKey === DEFAULT_DB) {
      return {
        dbKey: dbKey,
        host: process.env["E2E_HOST"],
        process: { kill: () => {} },
      };
    } else {
      let port = getPort();
      return {
        dbKey: dbKey,
        dbFile: dbFile,
        host: `http://localhost:${port}`,
        port: port,
      };
    }
  },
  async start(server) {
    if (!server.process) {
      if (server.dbKey !== server.dbFile) {
        await fs.copy(`${server.dbKey}.h2.db`, `${server.dbFile}.h2.db`);
      }
      server.process = spawn(
        "java",
        [
          "-XX:+IgnoreUnrecognizedVMOptions", // ignore options not recognized by this Java version (e.g. Java 8 should ignore Java 9 options)
          "-Dh2.bindAddress=localhost", // fix H2 randomly not working (?)
          "-Xmx2g", // Hard limit of 2GB size for the heap since Circle is dumb and the JVM tends to go over the limit otherwise
          "-Xverify:none", // Skip bytecode verification for the JAR so it launches faster
          "-Djava.awt.headless=true", // when running on macOS prevent little Java icon from popping up in Dock
          "--add-modules=java.xml.bind", // Tell Java 9 we want to use java.xml stuff
          "-jar",
          "target/uberjar/metabase.jar",
        ],
        {
          env: {
            MB_DB_FILE: server.dbFile,
            MB_JETTY_PORT: server.port,
          },
          stdio: "inherit",
        },
      );
    }
    if (!await isReady(server.host)) {
      process.stdout.write(
        "Waiting for backend (host=" +
          server.host +
          " dbKey=" +
          server.dbKey +
          ")",
      );
      while (!await isReady(server.host)) {
        process.stdout.write(".");
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
        await fs.unlink(`${server.dbFile}.h2.db`);
      }
    } catch (e) {}
  },
});

export async function isReady(host) {
  try {
    let response = await fetch(`${host}/api/health`);
    if (response.status === 200) {
      return true;
    }
  } catch (e) {}
  return false;
}

function createSharedResource(
  resourceName,
  {
    defaultOptions,
    getKey = options => JSON.stringify(options),
    create = options => ({}),
    start = resource => {},
    stop = resource => {},
  },
) {
  let entriesByKey = new Map();
  let entriesByResource = new Map();

  function kill(entry) {
    if (entriesByKey.has(entry.key)) {
      entriesByKey.delete(entry.key);
      entriesByResource.delete(entry.resource);
      let p = stop(entry.resource).then(null, err =>
        console.log("Error stopping resource", resourceName, entry.key, err),
      );
      return p;
    }
  }

  return {
    get(options = defaultOptions) {
      let key = getKey(options);
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
      let entry = entriesByResource.get(resource);
      return start(entry.resource);
    },
    async stop(resource) {
      let entry = entriesByResource.get(resource);
      if (entry && --entry.references <= 0) {
        await kill(entry);
      }
    },
  };
}
