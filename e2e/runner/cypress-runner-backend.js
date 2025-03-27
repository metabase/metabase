#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");

const http = require("http");
const os = require("os");
const path = require("path");

const { delay } = require("./cypress-runner-utils");

const CypressBackend = {
  server: null,
  createServer(port = process.env.BACKEND_PORT || 4000) {
    const generateTempDbPath = () =>
      path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

    const server = {
      dbFile: generateTempDbPath(),
      host: `http://localhost:${port}`,
      port,
    };

    this.server = server;
  },
  async start() {
    if (!this.server) {
      this.createServer();
    }
    if (!this.server.process) {
      const javaFlags = [
        "-XX:+IgnoreUnrecognizedVMOptions", // ignore options not recognized by this Java version (e.g. Java 8 should ignore Java 9 options)
        "-Dh2.bindAddress=localhost", // fix H2 randomly not working (?)
        "-Djava.awt.headless=true", // when running on macOS prevent little Java icon from popping up in Dock
        "-Duser.timezone=US/Pacific",
        process.env.SHOW_BACKEND_LOGS === "true"
          ? null
          : `-Dlog4j.configurationFile=file:${__dirname}/../../frontend/test/__runner__/log4j2.xml`,
      ].filter(Boolean);

      const metabaseConfig = {
        MB_DB_TYPE: "h2",
        MB_DB_FILE: this.server.dbFile,
        MB_JETTY_HOST: "0.0.0.0",
        MB_JETTY_PORT: this.server.port,
        MB_ENABLE_TEST_ENDPOINTS: "true",
        MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE: "true",
        MB_LAST_ANALYTICS_CHECKSUM: "-1",
        MB_DB_CONNECTION_URI: "", // ignore connection URI in favor of the db file
        MB_CONFIG_FILE_PATH: "__cypress__", // ignore config.yml
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

      this.server.process = spawn(
        "java",
        [...javaFlags, "-jar", "target/uberjar/metabase.jar"],
        {
          env: {
            ...process.env,
            ...metabaseConfig,
            ...userDefaults,
          },
          stdio:
            process.env["DISABLE_LOGGING"] ||
            process.env["DISABLE_LOGGING_BACKEND"]
              ? "ignore"
              : "inherit",
          detached: true,
        },
      );
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
