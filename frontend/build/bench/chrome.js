/* eslint-env node */

/**
 * The slice of headless Chrome and the DevTools protocol the benchmarks need.
 *
 * Shared by measure.js, which times a page load, and memory.js, which counts
 * what a session retains. Both drive Chrome directly rather than through a test
 * runner, because a runner shares the renderer with the page and every
 * process-wide reading then carries the runner's own growth.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function devtools(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    http
      .request({ host: "127.0.0.1", port, path, method }, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          // /json/version and /json/new answer with JSON. /json/close answers
          // with the plain string "Target is closing".
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      })
      .on("error", reject)
      .end();
  });
}

/** A DevTools protocol connection over the native WebSocket. */
class Session {
  constructor(socket) {
    this.socket = socket;
    this.lastId = 0;
    this.pending = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const resolve = this.pending.get(message.id);
      if (resolve) {
        this.pending.delete(message.id);
        resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.lastId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
}

async function launchChrome(port) {
  const chrome = spawn(CHROME, [
    "--headless=new",
    // The harness only ever loads its own server on localhost, and a Chrome
    // installed by CI has no SUID sandbox binary to use.
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${fs.mkdtempSync("/tmp/metabase-bench-")}`,
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-networking",
    "--window-size=1280,900",
  ]);
  chrome.stderr.on("data", () => {});

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await devtools(port, "/json/version");
      return chrome;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Chrome did not open a debugging port on ${port}`);
}

/** Opens a fresh tab and returns a protocol session attached to it. */
async function openSession(port) {
  const target = await devtools(port, "/json/new?about:blank", "PUT");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  return new Session(socket);
}

module.exports = {
  CHROME,
  Session,
  devtools,
  launchChrome,
  openSession,
  sleep,
};
