#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { waitUntilReady, shell } = require("./cypress-runner-utils");

const tempDbPath = path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

function getJvmOptsFromDepsEdn(alias = "e2e") {
  const cmd = `clojure -Sdeps '{:deps {}}' -M -e '(->> (-> "deps.edn" slurp clojure.edn/read-string :aliases :${alias} :jvm-opts) (clojure.string/join " ") println)'`;
  return execSync(cmd, { encoding: "utf8" }).trim().toString();
}

// Ensure that the only two required env vars have values
process.env.MB_DB_FILE = process.env.MB_DB_FILE || tempDbPath;
process.env.MB_JETTY_PORT = process.env.MB_JETTY_PORT || 4000;

if (!process.env.CI) {
  // Use a temporary copy of the sample db so it won't use and lock the db used for local development
  process.env.MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR = path.resolve(
    __dirname,
    "../../e2e/tmp", // already exists and is .gitignored
  );
}

const CypressBackend = {
  server: {
    dbFile: process.env.MB_DB_FILE,
    host: `http://localhost:${process.env.MB_JETTY_PORT}`,
  },
  async runFromJar(jarPath = "target/uberjar/metabase.jar") {
    if (!fs.existsSync(jarPath)) {
      console.log("Build the JAR with ./bin/build.sh\n");
      throw new Error(`JAR ${jarPath} does not exist!`);
    }
    if (!this.server.process) {
      process.env.JDK_JAVA_OPTIONS = getJvmOptsFromDepsEdn();
      this.server.process = spawn("java", ["-jar", jarPath], {
        env: process.env,
        stdio: process.env.CI ? "ignore" : "inherit",
        detached: true,
      });
      await waitUntilReady(this.server);
      if (process.env.CI) {
        this.server.process.unref(); // detach console
      }
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
