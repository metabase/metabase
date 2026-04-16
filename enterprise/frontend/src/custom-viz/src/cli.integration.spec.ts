import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = join(__dirname, "..", "dist", "cli.js");
const CUSTOM_VIZ_PACKAGE_DIR = join(__dirname, "..");

// Local dev server URL used in integration tests
const DEV_SERVER_URL = "http://localhost:5174";

let tmpDir: string;

describe("build output validation", () => {
  let projectDir: string;

  beforeAll(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    tmpDir = await mkdtemp(join(tmpdir(), "custom-viz-build-"));
    projectDir = await scaffold("test-viz-build");

    // Point to local package
    const pkgPath = join(projectDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.devDependencies["@metabase/custom-viz"] =
      `file:${CUSTOM_VIZ_PACKAGE_DIR}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    await npmInstall(projectDir);
    await npmRun("build", projectDir);
  }, 120_000);

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("dist/index.js exists", () => {
    expect(existsSync(join(projectDir, "dist", "index.js"))).toBe(true);
  });

  it("output format is IIFE", () => {
    const bundle = readFileSync(join(projectDir, "dist", "index.js"), "utf-8");
    expect(bundle).toContain("__customVizPlugin__");
  });

  it("React is externalized (not bundled)", () => {
    const bundle = readFileSync(join(projectDir, "dist", "index.js"), "utf-8");
    expect(bundle).not.toContain("react-dom");
    expect(bundle).not.toContain(
      "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED",
    );
    // The bundle should be small (React alone is ~100KB+)
    expect(bundle.length).toBeLessThan(10000);
  });

  it("metabase-plugin.json is copied to dist/", () => {
    const manifestPath = join(projectDir, "metabase-plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("test-viz-build");
    expect(manifest).toHaveProperty("icon");
    expect(manifest).toHaveProperty("assets");
  });
});

describe("dev server", () => {
  let projectDir: string;
  let devProcess: ChildProcess | null = null;

  beforeAll(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    tmpDir = await mkdtemp(join(tmpdir(), "custom-viz-dev-"));
    projectDir = await scaffold("test-viz-dev");

    // Point to local package
    const pkgPath = join(projectDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.devDependencies["@metabase/custom-viz"] =
      `file:${CUSTOM_VIZ_PACKAGE_DIR}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    await npmInstall(projectDir);

    // Start the dev server once for all tests
    devProcess = await startDevServer(projectDir);
  }, 180_000);

  afterAll(async () => {
    if (devProcess && !devProcess.killed) {
      devProcess.kill("SIGTERM");
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("serves SSE endpoint with CORS headers", async () => {
    // Use raw TCP to inspect headers, since http.get/fetch hang on SSE
    // streams that don't send initial data.
    const { Socket } = await import("node:net");

    const rawResponse = await new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      let data = "";

      socket.connect(5174, "localhost", () => {
        socket.write("GET /__sse HTTP/1.1\r\nHost: localhost:5174\r\n\r\n");
      });

      socket.on("data", (chunk) => {
        data += chunk.toString();
        // Once we have the headers (double CRLF), we can close
        if (data.includes("\r\n\r\n")) {
          socket.destroy();
          resolve(data);
        }
      });

      socket.on("error", reject);
      setTimeout(() => {
        socket.destroy();
        reject(new Error("Socket timed out"));
      }, 5_000);
    });

    expect(rawResponse).toContain("HTTP/1.1 200");
    expect(rawResponse).toContain("text/event-stream");
    expect(rawResponse.toLowerCase()).toContain(
      "access-control-allow-origin: *",
    );
  }, 10_000);

  it("serves landing page at /", async () => {
    const response = await fetch(`${DEV_SERVER_URL}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");

    const html = await response.text();
    expect(html).toContain("</html>");
  }, 10_000);

  it("broadcasts SSE reload event on asset change", async () => {
    const { get } = await import("node:http");

    const received = await new Promise<string>((resolve, reject) => {
      let data = "";

      const req = get(`${DEV_SERVER_URL}/__sse`, (res) => {
        res.setEncoding("utf-8");
        res.on("data", (chunk: string) => {
          data += chunk;
          if (data.includes("data: reload")) {
            res.destroy();
            req.destroy();
            resolve(data);
          }
        });
      });

      req.on("error", (err) => {
        // ECONNRESET is expected when we destroy the connection
        if ("code" in err && err.code === "ECONNRESET") {
          resolve(data);
        } else {
          reject(err);
        }
      });

      // Wait briefly for SSE connection to establish, then modify an asset
      setTimeout(() => {
        const assetPath = join(projectDir, "public", "assets", "icon.svg");
        const originalContent = readFileSync(assetPath, "utf-8");
        writeFileSync(
          assetPath,
          originalContent + `<!-- modified ${Date.now()} -->`,
        );
      }, 500);

      // Timeout fallback
      setTimeout(() => {
        req.destroy();
        resolve(data);
      }, 15_000);
    });

    expect(received).toContain("data: reload");
  }, 30_000);
});

async function scaffold(name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "node",
      [CLI_PATH, "init", name],
      { cwd: tmpDir },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`scaffold failed: ${stderr}`));
        } else {
          resolve(join(tmpDir, name));
        }
      },
    );
  });
}

async function npmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "npm",
      ["install", "--ignore-scripts"],
      { cwd, timeout: 120_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`npm install failed: ${stderr}`));
        } else {
          resolve();
        }
      },
    );
  });
}

async function npmRun(
  script: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "npm",
      ["run", script],
      { cwd, timeout: 120_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`npm run ${script} failed: ${stderr}`));
        } else {
          resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        }
      },
    );
  });
}

function startDevServer(cwd: string): Promise<ChildProcess> {
  return new Promise<ChildProcess>((resolve, reject) => {
    const proc = spawn("npm", ["run", "dev"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      reject(new Error("Dev server did not start within 60s"));
    }, 60_000);

    let output = "";
    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes("Dev server listening")) {
        clearTimeout(timeout);
        resolve(proc);
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${code}: ${output}`));
      }
    });
  });
}
