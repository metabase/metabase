#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const { delay } = require("./cypress-runner-utils");

class BaseBackend {
  constructor() {
    this.server = null;
  }

  createServer(port = process.env.BACKEND_PORT || 4000) {
    const generateTempDbPath = () =>
      path.join(os.tmpdir(), `metabase-test-${process.pid}.db`);

    this.server = {
      dbFile: generateTempDbPath(),
      host: `http://localhost:${port}`,
      port,
    };
  }

  // subclasses must return { cmd, args }
  getCommand() {
    throw new Error("buildCommand() not implemented in base class");
  }

  getEnv() {
    return {
      MB_DB_TYPE: "h2",
      MB_DB_FILE: this.server.dbFile,
      MB_JETTY_HOST: "0.0.0.0",
      MB_JETTY_PORT: this.server.port,
      MB_ENABLE_TEST_ENDPOINTS: "true",
      MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE: "true",
      MB_LAST_ANALYTICS_CHECKSUM: "-1",
      MB_DB_CONNECTION_URI: "",
      MB_CONFIG_FILE_PATH: "__cypress__",
    };
  }

  async start() {
    if (!this.server) {
      this.createServer();
    }

    if (!this.server.process) {
      const { cmd, args } = this.getCommand();

      this.server.process = spawn(cmd, args, {
        env: {
          ...process.env,
          ...this.getEnv(),
          MB_USER_DEFAULTS: JSON.stringify({
            token: "123456",
            user: {
              first_name: "Testy",
              last_name: "McTestface",
              email: "testy@metabase.test",
              site_name: "Epic Team",
            },
          }),
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
        if (!process.env.CI) {
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
      this.server.process.unref();
    }

    async function isReady(host) {
      const reqJson = (url) =>
        new Promise((resolve, reject) => {
          const req = http.get(url, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              try {
                resolve(JSON.parse(body));
              } catch {
                resolve({});
              }
            });
          });
          req.on("error", reject);
        });

      try {
        const { status } = await reqJson(`${host}/api/health`);
        return status === "ok";
      } catch {
        return false;
      }
    }
  }

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
    } catch {}
  }
}

class JarBackend extends BaseBackend {
  getCommand() {
    const javaFlags = [
      "-XX:+IgnoreUnrecognizedVMOptions", // ignore options not recognized by this Java version
      "-Dh2.bindAddress=localhost",
      "-Djava.awt.headless=true",
      "-Dmail.smtps.ssl.trust=*",
      "-Duser.timezone=US/Pacific",
      process.env.SHOW_BACKEND_LOGS === "true"
        ? null
        : `-Dlog4j.configurationFile=file:${__dirname}/../../frontend/test/__runner__/log4j2.xml`,
    ].filter(Boolean);

    return {
      cmd: "java",
      args: [...javaFlags, "-jar", "target/uberjar/metabase.jar"],
    };
  }
}

class LiveBackend extends BaseBackend {
  getCommand() {
    const mbEdition = process.env.MB_EDITION || "ee";
    const alias = mbEdition === "oss" ? "-M:dev:run" : "-M:dev:run:ee";
    return { cmd: "clojure", args: [alias] };
  }
}

const jarBackend = new JarBackend();
const liveBackend = new LiveBackend();
Object.assign(jarBackend, { JarBackend: jarBackend, LiveBackend: liveBackend });

module.exports = jarBackend;
