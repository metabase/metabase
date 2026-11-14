#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { waitUntilReady, shell } = require("./cypress-runner-utils");

const tempDbPath = path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

function getJvmOptsFromDepsEdn(alias = "e2e") {
  const depsEdnPath = path.resolve(__dirname, "../../deps.edn");
  const depsEdn = fs.readFileSync(depsEdnPath, "utf8");
  const aliasBlockPattern = new RegExp(
    `:${alias}\\s*\\n\\s*\\{:jvm-opts\\s*\\[([\\s\\S]*?)\\]\\s*\\}`,
    "m",
  );
  const aliasBlock = depsEdn.match(aliasBlockPattern)?.[1];
  if (!aliasBlock) {
    throw new Error(`Could not find :jvm-opts for alias :${alias} in deps.edn`);
  }

  const jvmOpts = [...aliasBlock.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(
    ([, option]) => JSON.parse(`"${option}"`),
  );
  return jvmOpts.join(" ");
}

// Ensure that the only two required env vars have values
process.env.MB_DB_FILE = process.env.MB_DB_FILE || tempDbPath;
process.env.MB_JETTY_PORT = process.env.MB_JETTY_PORT || 4000;
process.env.MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED =
  process.env.MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED || "true";

// Expose the `en-ZZ` pseudo-locale in the Cypress backend's language pickers and API validation.
process.env.MB_ENABLE_TEST_LOCALES = "true";

// Use the H2 sample database in E2E tests. Production ships SQLite, but the test suite was written
// against the H2 sample data; this defers migrating the tests to SQLite until after the release.
process.env.MB_SAMPLE_DATABASE_ENGINE = "h2";

// The warehouses the E2E suite connects to are all on localhost, so the warehouse network policy has to be off.
// It otherwise defaults to `external-only` whenever `is-hosted?` is true, which any spec calling
// `setTokenFeatures("all")` (or activating a cloud token) makes true -- and those specs would then be unable to
// add or sync a test database. Set here rather than in the `:e2e` deps.edn alias because CI runs the uberjar and
// never reads that alias. A spec that wants the policy on can set it through the settings API.
process.env.MB_WAREHOUSE_ALLOWED_NETWORKS = "allow-all";
// Metabot specs use a mock LLM server on localhost, so E2E runs must allow loopback LLM endpoints.
process.env.MB_LLM_ALLOWED_NETWORKS = "allow-all";

if (!process.env.CI) {
  // Use a temporary copy of the sample db so it won't use and lock the db used for local development
  process.env.MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR = path.resolve(
    __dirname,
    "../../e2e/tmp", // already exists and is .gitignored
  );
}

const BACKGROUND_STATE_FILE = path.resolve(
  __dirname,
  "../../target/e2e-backend.json",
);
const BACKGROUND_LOG_FILE = path.resolve(
  __dirname,
  "../../target/e2e-backend.log",
);

function spawnJar(jarPath, { stdio }) {
  if (!fs.existsSync(jarPath)) {
    console.log("Build the JAR with ./bin/build.sh\n");
    throw new Error(`JAR ${jarPath} does not exist!`);
  }
  process.env.JDK_JAVA_OPTIONS = getJvmOptsFromDepsEdn();
  return spawn("java", ["-jar", jarPath], {
    env: process.env,
    stdio,
    detached: true,
  });
}

/** `processOrPid` is a `ChildProcess` of this process, or the PID of a process started by another one. */
function isRunning(processOrPid) {
  if (typeof processOrPid !== "number") {
    return processOrPid.exitCode === null && processOrPid.signalCode === null;
  }
  try {
    process.kill(processOrPid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function tailOfFile(file, lineCount) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .slice(-lineCount)
      .join("\n");
  } catch (error) {
    return `(could not read it: ${error.message})`;
  }
}

const CypressBackend = {
  server: {
    dbFile: process.env.MB_DB_FILE,
    host: `http://localhost:${process.env.MB_JETTY_PORT}`,
  },
  async runFromJar(jarPath = "target/uberjar/metabase.jar") {
    if (!this.server.process) {
      this.server.process = spawnJar(jarPath, {
        stdio: process.env.CI ? "ignore" : "inherit",
      });
      const child = this.server.process;
      await waitUntilReady(this.server, { isAlive: () => isRunning(child) });
      if (process.env.CI) {
        this.server.process.unref(); // detach console
      }
    }
  },

  /**
   * Start the JAR in the background and return without waiting for it, so CI can prepare the rest of the job while
   * Metabase starts. Wait for it with `waitForBackgroundJar`, which can run in another process: the backend's PID
   * and address go to `BACKGROUND_STATE_FILE`, and its output to `BACKGROUND_LOG_FILE`.
   */
  startJarInBackground(jarPath = "target/uberjar/metabase.jar") {
    const log = fs.openSync(BACKGROUND_LOG_FILE, "a");
    const child = spawnJar(jarPath, { stdio: ["ignore", log, log] });
    child.unref();
    fs.writeFileSync(
      BACKGROUND_STATE_FILE,
      JSON.stringify({ pid: child.pid, ...this.server }),
    );
    console.log(
      `Started backend in the background (pid=${child.pid}, host=${this.server.host}, log=${BACKGROUND_LOG_FILE})`,
    );
  },

  async waitForBackgroundJar() {
    const { pid, ...server } = JSON.parse(
      fs.readFileSync(BACKGROUND_STATE_FILE, "utf8"),
    );
    try {
      await waitUntilReady(server, { isAlive: () => isRunning(pid) });
    } catch (error) {
      console.log(`\nLast lines of ${BACKGROUND_LOG_FILE}:`);
      console.log(tailOfFile(BACKGROUND_LOG_FILE, 100));
      throw error;
    }
  },

  async runFromSource() {
    if (!this.server.process) {
      const edition = process.env.MB_EDITION || "ee";

      this.server.process = spawn(
        "clojure",
        [`-M:run:${edition}:dev:dev-start:drivers:e2e`, "--hot"],
        {
          env: process.env,
          stdio: process.env.CI ? "ignore" : "inherit",
          detached: true,
        },
      );
      await waitUntilReady(this.server);
      if (process.env.CI) {
        this.server.process.unref(); // detach console
      }
    }
  },

  async stop() {
    if (this?.server?.process) {
      this.server.process.kill("SIGKILL");
      console.log(
        `Stopped backend (host=${this.server.host}, dbFile=${this.server.dbFile})`,
      );
    }
    try {
      if (this?.server?.dbFile) {
        fs.unlinkSync(`${this.server.dbFile}.mv.db`);
        fs.unlinkSync(`${this.server.dbFile}.trace.db`);
      }
    } catch (e) {}
  },
};

function getBackendPid() {
  return shell(`lsof -ti:${process.env.MB_JETTY_PORT} || echo ""`, {
    quiet: true,
  });
}

module.exports = { ...CypressBackend, getBackendPid };
