import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { type Server, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type GenerationState, readGenerationState } from "./generation-state";

const ENSURE_TYPES_PATH = join(
  process.cwd(),
  "frontend/build/openapi/ensure-types.ts",
);
const EVENT_LOG_PATH = ".tmp/openapi/events.jsonl";
const STATE_PATH = ".tmp/openapi/generation.json";
const LOCK_PATH = ".tmp/openapi/types-ensure.lock";
const TYPES_PATH = "frontend/src/metabase-types/openapi/types.gen.d.ts";
const OPENAPI_INFO = { title: "Metabase API", version: "1.0.0" };
const EE_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: OPENAPI_INFO,
  paths: { "/api/card": {}, "/api/ee/example": {} },
});
const OSS_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: OPENAPI_INFO,
  paths: { "/api/card": {} },
});

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function writeExecutable(path: string, contents: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function writeHarness(root: string) {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/example.clj"), "(def example true)\n");
  mkdirSync(join(root, "frontend/build/openapi"), { recursive: true });
  writeFileSync(
    join(root, "frontend/build/openapi/openapi-ts.config.ts"),
    "export default {};\n",
  );
  writeFileSync(join(root, "package.json"), "{}\n");
  writeFileSync(join(root, "bun.lock"), "lock-v1\n");

  // Fake `clojure` on PATH: writes the spec like the real generator does.
  writeExecutable(
    join(root, "stub-bin/clojure"),
    `#!/usr/bin/env bun
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
mkdirSync(".tmp/openapi", { recursive: true });
appendFileSync(${JSON.stringify(EVENT_LOG_PATH)}, JSON.stringify({ stage: "local" }) + "\\n");
console.log("java stdout sentinel");
console.error("java stderr sentinel");
if (process.env.FAIL_GENERATE) process.exit(Number(process.env.FAIL_GENERATE));
const countPath = ".tmp/openapi/generate-count";
const count = existsSync(countPath) ? Number(readFileSync(countPath, "utf8")) + 1 : 1;
writeFileSync(countPath, String(count));
if (process.env.MUTATE_SOURCE === "always" || (process.env.MUTATE_SOURCE === "once" && count === 1)) {
  appendFileSync("src/example.clj", "\\n");
}
writeFileSync(".tmp/openapi/openapi.json", process.env.GENERATED_SPEC ?? ${JSON.stringify(EE_SPEC)});
`,
  );

  // Fake hey-api: consumes METABASE_OPENAPI_INPUT, writes declaration outputs
  // into METABASE_OPENAPI_OUTPUT.
  writeExecutable(
    join(root, "node_modules/.bin/openapi-ts"),
    `#!/usr/bin/env bun
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
appendFileSync(${JSON.stringify(EVENT_LOG_PATH)}, JSON.stringify({ stage: "types" }) + "\\n");
if (process.env.FAIL_TYPES) process.exit(Number(process.env.FAIL_TYPES));
const input = process.env.METABASE_OPENAPI_INPUT ?? ".tmp/openapi/openapi.json";
const output = process.env.METABASE_OPENAPI_OUTPUT ?? "frontend/src/metabase-types/openapi";
const consumedSpec = readFileSync(input, "utf8");
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "types.gen.d.ts"), "export type Example = " + JSON.stringify(consumedSpec) + ";\\n");
`,
  );
}

function ensureEnvironment(
  root: string,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${join(root, "stub-bin")}:${process.env.PATH}`,
    MB_JETTY_PORT: "1",
    ...environment,
  };
}

function runEnsure(
  root: string,
  arguments_: string[] = [],
  environment: NodeJS.ProcessEnv = {},
): CommandResult {
  const result = spawnSync("bun", [ENSURE_TYPES_PATH, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    env: ensureEnvironment(root, environment),
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runEnsureAsync(
  root: string,
  arguments_: string[] = [],
  environment: NodeJS.ProcessEnv = {},
): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("bun", [ENSURE_TYPES_PATH, ...arguments_], {
      cwd: root,
      env: ensureEnvironment(root, environment),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr += String(chunk)));
    child.once("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

function readEvents(root: string): string[] {
  const path = join(root, EVENT_LOG_PATH);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (
        typeof value !== "object" ||
        value === null ||
        !("stage" in value) ||
        typeof value.stage !== "string"
      ) {
        throw new Error(`invalid event: ${line}`);
      }
      return value.stage;
    });
}

function clearEvents(root: string) {
  rmSync(join(root, EVENT_LOG_PATH), { force: true });
}

function stateAt(root: string): GenerationState {
  const state = readGenerationState(join(root, STATE_PATH));
  if (state === undefined) {
    throw new Error("expected generation state");
  }
  return state;
}

async function waitForFile(path: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${path}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function startFakeBackend(
  specContents: string,
): Promise<{ server: Server; port: number; requestCount: () => number }> {
  return new Promise((resolvePromise) => {
    let requests = 0;
    const server = createServer((request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/json");
      response.end(specContents);
    });
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("could not determine fake backend port");
      }
      resolvePromise({
        server,
        port: address.port,
        requestCount: () => requests,
      });
    });
  });
}

describe("ensure-types", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ensure-types-"));
    writeHarness(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("generates from local source when no state exists, then is silently fresh", () => {
    const first = runEnsure(root);
    expect(first.status).toBe(0);
    expect(readEvents(root)).toEqual(["local", "types"]);
    expect(stateAt(root).sourceDigest).toBeDefined();
    expect(existsSync(join(root, TYPES_PATH))).toBe(true);
    expect(
      readFileSync(
        join(root, "frontend/src/metabase-types/openapi/index.ts"),
        "utf8",
      ),
    ).toBe('export type * from "./types.gen.d";\n');

    clearEvents(root);
    const second = runEnsure(root);
    expect(second.status).toBe(0);
    expect(second.stdout).toBe("");
    expect(readEvents(root)).toEqual([]);
  });

  it("logs the staleness reason when regenerating", () => {
    const first = runEnsure(root);
    expect(first.stdout).toContain("no generation state");

    appendFileSync(join(root, "src/example.clj"), "\n;; edit\n");
    const second = runEnsure(root);
    expect(second.stdout).toContain("backend source changed");
  });

  it("records backend-origin specs without a source digest and never treats them as source-fresh", async () => {
    const backend = await startFakeBackend(EE_SPEC);
    try {
      const environment = { MB_JETTY_PORT: String(backend.port) };
      const first = await runEnsureAsync(root, [], environment);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("running backend");
      expect(readEvents(root)).toEqual(["types"]);
      expect(stateAt(root).sourceDigest).toBeUndefined();
      expect(backend.requestCount()).toBe(1);

      // A second run must re-fetch (never source-fresh) but may reuse the
      // generated outputs because the spec hash is unchanged.
      clearEvents(root);
      const second = await runEnsureAsync(root, [], environment);
      expect(second.status).toBe(0);
      expect(backend.requestCount()).toBe(2);
      expect(readEvents(root)).toEqual([]);
      expect(stateAt(root).sourceDigest).toBeUndefined();
    } finally {
      backend.server.close();
    }
  });

  it("uses local generation when backend source changed", async () => {
    expect(runEnsure(root).status).toBe(0);
    appendFileSync(join(root, "src/example.clj"), "\n;; changed\n");
    clearEvents(root);

    const backend = await startFakeBackend(EE_SPEC);
    try {
      const result = await runEnsureAsync(root, [], {
        MB_JETTY_PORT: String(backend.port),
      });
      expect(result.status).toBe(0);
      expect(backend.requestCount()).toBe(0);
      expect(readEvents(root)).toEqual(["local"]);
      expect(stateAt(root).sourceDigest).toBeDefined();
    } finally {
      backend.server.close();
    }
  });

  it("falls back to local generation when the backend serves an OSS spec", async () => {
    const backend = await startFakeBackend(OSS_SPEC);
    try {
      const result = await runEnsureAsync(root, [], {
        MB_JETTY_PORT: String(backend.port),
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("OSS routes only");
      expect(readEvents(root)).toEqual(["local", "types"]);
      expect(stateAt(root).sourceDigest).toBeDefined();
    } finally {
      backend.server.close();
    }
  });

  it.each(["0", "00080", "65536", "3000 "])(
    "rejects invalid backend port %j and generates locally",
    (port) => {
      const result = runEnsure(root, [], { MB_JETTY_PORT: port });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`invalid MB_JETTY_PORT: ${port}`);
      expect(readEvents(root)).toEqual(["local", "types"]);
    },
  );

  it("retries once when backend source changes during generation", () => {
    const result = runEnsure(root, [], { MUTATE_SOURCE: "once" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("retrying once");
    expect(readEvents(root)).toEqual(["local", "local", "types"]);
  });

  it("fails when backend source keeps changing during generation", () => {
    const result = runEnsure(root, [], { MUTATE_SOURCE: "always" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("both OpenAPI generation attempts");
    expect(existsSync(join(root, STATE_PATH))).toBe(false);
  });

  it("replays captured generator output only on failure", () => {
    const success = runEnsure(root);
    expect(success.stdout).not.toContain("java stdout sentinel");

    rmSync(join(root, STATE_PATH), { force: true });
    clearEvents(root);
    const failure = runEnsure(root, [], { FAIL_GENERATE: "3" });
    expect(failure.status).toBe(3);
    expect(`${failure.stdout}${failure.stderr}`).toContain(
      "java stdout sentinel",
    );
  });

  it("force-local regenerates even when state is fresh", () => {
    expect(runEnsure(root).status).toBe(0);
    clearEvents(root);

    const result = runEnsure(root, ["--force-local"]);
    expect(result.status).toBe(0);
    expect(readEvents(root)).toEqual(["local", "types"]);
  });

  it("rejects the removed integrated lint option", () => {
    const result = runEnsure(root, ["--lint"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("unknown option: --lint");
  });

  it("regenerates when the generated outputs are modified on disk", () => {
    expect(runEnsure(root).status).toBe(0);
    clearEvents(root);

    appendFileSync(join(root, TYPES_PATH), "// manual edit\n");
    const result = runEnsure(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("generated outputs changed on disk");
    expect(readEvents(root)).toContain("types");
  });

  it("worker exits zero with a stderr warning when generation fails", () => {
    const result = runEnsure(root, ["--postinstall-worker"], {
      FAIL_GENERATE: "1",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("could not generate API types");
  });

  it("reports the lock path and holder age while waiting", async () => {
    mkdirSync(join(root, ".tmp/openapi"), { recursive: true });
    writeFileSync(
      join(root, LOCK_PATH),
      JSON.stringify({ pid: 99999, token: "someone-else" }),
    );

    const pending = runEnsureAsync(root);
    await new Promise((resolve) => setTimeout(resolve, 600));
    rmSync(join(root, LOCK_PATH), { force: true });
    const result = await pending;

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("waiting for generation lock");
    expect(result.stdout).toContain(`rm -rf ${LOCK_PATH}`);
  });

  describe("postinstall", () => {
    it("stays silent and spawns nothing when types are fresh", () => {
      expect(runEnsure(root).status).toBe(0);
      clearEvents(root);

      const result = runEnsure(root, ["--postinstall"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(readEvents(root)).toEqual([]);
    });

    it("prints one background line and completes generation via the worker", async () => {
      const result = runEnsure(root, ["--postinstall"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("generating API types in the background");
      expect(
        statSync(join(root, ".tmp/openapi/types-ensure.log")).mode & 0o777,
      ).toBe(0o600);

      await waitForFile(join(root, STATE_PATH));
      expect(stateAt(root).sourceDigest).toBeDefined();
      expect(existsSync(join(root, TYPES_PATH))).toBe(true);
    });

    it("does not follow a symlink at the worker log path", () => {
      const target = join(root, "log-target");
      writeFileSync(target, "unchanged\n");
      mkdirSync(join(root, ".tmp/openapi"), { recursive: true });
      symlinkSync(target, join(root, ".tmp/openapi/types-ensure.log"));

      const result = runEnsure(root, ["--postinstall"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("could not start API type generation");
      expect(readFileSync(target, "utf8")).toBe("unchanged\n");
    });

    it("worker exits quietly when the lock is held", () => {
      mkdirSync(join(root, ".tmp/openapi"), { recursive: true });
      writeFileSync(
        join(root, LOCK_PATH),
        JSON.stringify({ pid: 99999, token: "someone-else" }),
      );
      const now = new Date();
      utimesSync(join(root, LOCK_PATH), now, now);

      const result = runEnsure(root, ["--postinstall-worker"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(readEvents(root)).toEqual([]);
    });
  });
});
