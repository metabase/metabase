#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { BACKEND_PORT } = require("./constants/backend-port");
const { delay } = require("./cypress-runner-utils");

const CypressBackend = {
  server: null,
  createServer(port = BACKEND_PORT) {
    const generateTempDbPath = () =>
      path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

    const server = {
      dbFile: generateTempDbPath(),
      host: `http://localhost:${port}`,
    };

    this.server = server;
  },
  async start(jarPath = "target/uberjar/metabase.jar") {
    if (!this.server) {
      this.createServer();
    }
    if (!this.server.process) {
      const metabaseConfig = {
        MB_DB_FILE: this.server.dbFile,
        MB_JETTY_PORT: BACKEND_PORT,
      };

      this.server.process = spawn("java", ["-jar", jarPath], {
        env: {
          ...process.env,
          ...metabaseConfig,
        },
        stdio:
          process.env["DISABLE_LOGGING"] ||
          process.env["DISABLE_LOGGING_BACKEND"]
            ? "ignore"
            : "inherit",
        detached: true,
      });
    }

    if (!(await isReady(this.server.host))) {
      process.stdout.write(
        `Waiting for backend (host=${this.server.host}, dbFile=${this.server.dbFile})`,
      );
      while (!(await isReady(this.server.host))) {
        if (!process.env["CI"]) {
          // disable for CI since it breaks CircleCI's no_output_timeout
          process.stdout.write(".");
        }
        await delay(500);
      }
      process.stdout.write("\n");
    }

    console.log(
      `Backend ready host=${this.server.host}, dbFile=${this.server.dbFile}`,
    );

    if (process.env.CI) {
      this.server.process.unref(); // detach console
    }

    async function isReady(host) {
      // This is needed until we can use NodeJS native `fetch`.
      function request(url) {
        return new Promise((resolve, reject) => {
          const req = http.get(url, (res) => {
            let body = "";

            res.on("data", (chunk) => {
              body += chunk;
            });

            res.on("end", () => {
              resolve(JSON.parse(body));
            });
          });

          req.on("error", (e) => {
            reject(e);
          });
        });
      }

      try {
        const { status } = await request(`${host}/api/health`);
        if (status === "ok") {
          return true;
        }
      } catch (e) {}
      return false;
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
      }
    } catch (e) {}
  },
};

module.exports = CypressBackend;
