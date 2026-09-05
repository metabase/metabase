#!/usr/bin/env bun
/**
 * Keeps generated Enterprise API types in sync with backend source.
 *
 * Fresh runs exit without work. A changed local source regenerates through
 * Clojure; other stale runs may fetch a running Enterprise backend. Generation
 * stages its output and replaces the declaration atomically, so the lock only
 * avoids duplicate work. Postinstall uses a best-effort background worker.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withGenerationLock } from "./generation-lock";
import {
  GENERATED_OUTPUT_NAMES,
  GENERATED_TYPES_DIRECTORY,
  GENERATION_STATE_VERSION,
  type GenerationState,
  createContentHash,
  createOutputsHash,
  getOpenApiEdition,
  readGenerationState,
  writeGenerationStateAtomically,
} from "./generation-state";
import {
  createSourceFingerprint,
  createTypeGeneratorFingerprint,
} from "./source-fingerprint";

const SPEC_PATH = ".tmp/openapi/openapi.json";
const GENERATION_LOCK_PATH = ".tmp/openapi/types-ensure.lock";
const MAX_LOCK_WAIT_MS = 60_000;
const POSTINSTALL_LOG_PATH = ".tmp/openapi/types-ensure.log";
const OPENAPI_INPUT_ENV = "METABASE_OPENAPI_INPUT";
const OPENAPI_OUTPUT_ENV = "METABASE_OPENAPI_OUTPUT";
const BACKEND_TIMEOUT_MS = 2000;
const MAX_CAPTURED_OUTPUT_BYTES = 10 * 1024 * 1024;
const GENERATED_INDEX_CONTENT = 'export type * from "./types.gen.d";\n';

const CLOJURE_GENERATE_COMMAND = [
  "clojure",
  "-M:run:ee",
  "generate-openapi-spec",
];
const OPENAPI_TS_COMMAND = [
  "node_modules/.bin/openapi-ts",
  "-f",
  "./frontend/build/openapi/openapi-ts.config.ts",
];
interface EnsureOptions {
  forceLocal: boolean;
  postinstall: boolean;
  /** Best-effort background mode used by postinstall. */
  postinstallWorker: boolean;
}

interface AcquiredSpec {
  contents: string;
  hash: string;
  /** Omitted when the spec came from a running backend. */
  sourceDigest?: string;
}

function log(message: string) {
  // eslint-disable-next-line no-console
  console.log(`[types:ensure] ${message}`);
}

function parseOptions(arguments_: string[]): EnsureOptions {
  const knownArguments = new Set([
    "--force-local",
    "--postinstall",
    "--postinstall-worker",
  ]);
  const unknownArgument = arguments_.find(
    (argument) => !knownArguments.has(argument),
  );
  if (unknownArgument !== undefined) {
    throw new Error(`unknown option: ${unknownArgument}`);
  }
  return {
    forceLocal: arguments_.includes("--force-local"),
    postinstall: arguments_.includes("--postinstall"),
    postinstallWorker: arguments_.includes("--postinstall-worker"),
  };
}

interface RunCommandOptions {
  quietUnlessError?: boolean;
  postinstallWorker: boolean;
  env?: NodeJS.ProcessEnv;
}

/** Keep child commands asynchronous so the lock heartbeat can run. */
function runCommand(
  command: string[],
  { quietUnlessError = false, postinstallWorker, env }: RunCommandOptions,
): Promise<number> {
  const [executable, ...commandArguments] = command;
  if (executable === undefined) {
    return Promise.resolve(1);
  }
  return new Promise((resolvePromise) => {
    const output = postinstallWorker ? process.stdout.fd : "inherit";
    const child = spawn(executable, commandArguments, {
      env: { ...process.env, ...env },
      stdio: quietUnlessError
        ? ["inherit", "pipe", "pipe"]
        : ["inherit", output, output],
    });

    let capturedBytes = 0;
    let captured = "";
    const capture = (chunk: Buffer) => {
      if (capturedBytes < MAX_CAPTURED_OUTPUT_BYTES) {
        captured += String(chunk);
        capturedBytes += chunk.byteLength;
      }
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);

    const finish = (status: number) => {
      if (quietUnlessError && status !== 0) {
        const errorOutput = postinstallWorker ? process.stdout : process.stderr;
        errorOutput.write(captured);
      }
      resolvePromise(status);
    };
    child.once("error", (error) => {
      const errorOutput = postinstallWorker ? process.stdout : process.stderr;
      errorOutput.write(`${error.message}\n`);
      finish(1);
    });
    child.once("close", (status) => finish(status ?? 1));
  });
}

function backendUrl(): string | undefined {
  const configuredPort = process.env.MB_JETTY_PORT;
  if (configuredPort === undefined) {
    return "http://localhost:3000/api/docs/openapi.json";
  }
  const port = Number(configuredPort);
  if (!/^[1-9]\d{0,4}$/.test(configuredPort) || port > 65_535) {
    return undefined;
  }
  return `http://localhost:${port}/api/docs/openapi.json`;
}

function readCompleteSpec(): string | undefined {
  try {
    const contents = readFileSync(SPEC_PATH, "utf8");
    return getOpenApiEdition(contents) === "ee" ? contents : undefined;
  } catch {
    return undefined;
  }
}

function writePrivateFile(path: string, contents: string): void {
  let fileDescriptor: number | undefined;
  mkdirSync(dirname(path), { recursive: true });
  try {
    fileDescriptor = openSync(path, "wx", 0o600);
    writeFileSync(fileDescriptor, contents);
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
}

function publishSpecAtomically(contents: string): void {
  const temporaryPath = `${SPEC_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writePrivateFile(temporaryPath, contents);
    renameSync(temporaryPath, SPEC_PATH);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

async function fetchSpecFromBackend(
  url: string,
): Promise<{ contents: string; edition: "oss" | "ee" } | undefined> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      return undefined;
    }
    const contents = await response.text();
    const edition = getOpenApiEdition(contents);
    return edition === undefined ? undefined : { contents, edition };
  } catch {
    return undefined;
  }
}

type StalenessReason =
  | "no generation state"
  | "previous types came from a running backend"
  | "backend source changed"
  | "type generator inputs changed"
  | "generated outputs changed on disk";

/** Returns why regeneration is needed, or nothing when types are fresh. */
function stalenessReason(
  state: GenerationState | undefined,
  sourceDigest: string,
  generatorDigest: string,
): StalenessReason | undefined {
  if (state === undefined) {
    return "no generation state";
  }
  if (state.sourceDigest === undefined) {
    return "previous types came from a running backend";
  }
  if (state.sourceDigest !== sourceDigest) {
    return "backend source changed";
  }
  if (state.generatorDigest !== generatorDigest) {
    return "type generator inputs changed";
  }
  if (createOutputsHash() !== state.outputsHash) {
    return "generated outputs changed on disk";
  }
  return undefined;
}

function freshBeforePostinstall(): boolean {
  try {
    return (
      stalenessReason(
        readGenerationState(),
        createSourceFingerprint(),
        createTypeGeneratorFingerprint(),
      ) === undefined
    );
  } catch {
    return false;
  }
}

function startPostinstallWorker(): number {
  let logFileDescriptor: number | undefined;
  try {
    mkdirSync(dirname(POSTINSTALL_LOG_PATH), { recursive: true });
    logFileDescriptor = openSync(
      POSTINSTALL_LOG_PATH,
      constants.O_APPEND |
        constants.O_CREAT |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    if (!fstatSync(logFileDescriptor).isFile()) {
      throw new Error("postinstall log is not a regular file");
    }
    fchmodSync(logFileDescriptor, 0o600);
    const scriptPath = process.argv[1];
    if (scriptPath === undefined) {
      throw new Error("could not determine types:ensure script path");
    }
    const worker = spawn(
      process.execPath,
      [scriptPath, "--postinstall-worker"],
      {
        detached: true,
        stdio: ["ignore", logFileDescriptor, "inherit"],
      },
    );
    worker.unref();
    log(
      `generating API types in the background (logs: ${POSTINSTALL_LOG_PATH})`,
    );
  } catch {
    log(
      "⚠ could not start API type generation — run `bun run types:ensure` to see the failure",
    );
  } finally {
    if (logFileDescriptor !== undefined) {
      closeSync(logFileDescriptor);
    }
  }
  return 0;
}

async function acquireFromLocalSource(
  options: EnsureOptions,
): Promise<{ status: number; spec?: AcquiredSpec }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sourceDigest = createSourceFingerprint();
    log("generating the complete OpenAPI document from local source");
    const status = await runCommand(CLOJURE_GENERATE_COMMAND, {
      quietUnlessError: true,
      postinstallWorker: options.postinstallWorker,
    });
    if (status !== 0) {
      return { status };
    }

    const contents = readCompleteSpec();
    if (contents === undefined) {
      log(
        "error: local source generation did not produce a complete EE OpenAPI document",
      );
      return { status: 1 };
    }
    const currentSourceDigest = createSourceFingerprint();
    if (sourceDigest === currentSourceDigest) {
      return {
        status: 0,
        spec: {
          contents,
          hash: createContentHash(contents),
          sourceDigest: currentSourceDigest,
        },
      };
    }

    if (attempt === 0) {
      log("backend source changed during OpenAPI generation — retrying once");
      continue;
    }
    log(
      "error: backend source changed during both OpenAPI generation attempts",
    );
    return { status: 1 };
  }
  return { status: 1 };
}

async function acquireCurrentSpec(
  options: EnsureOptions,
  reason: StalenessReason | undefined,
): Promise<{ status: number; spec?: AcquiredSpec }> {
  if (!options.forceLocal && reason !== "backend source changed") {
    const url = backendUrl();
    if (url === undefined) {
      log(`invalid MB_JETTY_PORT: ${process.env.MB_JETTY_PORT}`);
      return acquireFromLocalSource(options);
    }
    const backendSpec = await fetchSpecFromBackend(url);
    if (backendSpec?.edition === "ee") {
      publishSpecAtomically(backendSpec.contents);
      log(`fetched complete OpenAPI spec from running backend (${url})`);
      return {
        status: 0,
        spec: {
          contents: backendSpec.contents,
          hash: createContentHash(backendSpec.contents),
        },
      };
    }
    if (backendSpec?.edition === "oss") {
      log("running backend exposes OSS routes only");
    }
  }
  return acquireFromLocalSource(options);
}

async function generateTypes(
  spec: AcquiredSpec,
  options: EnsureOptions,
): Promise<{ status: number; outputsHash?: string }> {
  const snapshotPath = `${SPEC_PATH}.${process.pid}.${randomUUID()}.snapshot.json`;
  const outputDirectory = `.tmp/openapi/types-out.${process.pid}.${randomUUID()}`;
  try {
    writePrivateFile(snapshotPath, spec.contents);
    const status = await runCommand(OPENAPI_TS_COMMAND, {
      postinstallWorker: options.postinstallWorker,
      env: {
        [OPENAPI_INPUT_ENV]: snapshotPath,
        [OPENAPI_OUTPUT_ENV]: outputDirectory,
      },
    });
    if (status !== 0) {
      return { status };
    }
    writePrivateFile(
      join(outputDirectory, "index.ts"),
      GENERATED_INDEX_CONTENT,
    );
    const outputsHash = createOutputsHash(outputDirectory);
    if (outputsHash === undefined) {
      log("error: type generation did not produce declaration outputs");
      return { status: 1 };
    }
    mkdirSync(GENERATED_TYPES_DIRECTORY, { recursive: true });
    for (const name of GENERATED_OUTPUT_NAMES) {
      renameSync(
        join(outputDirectory, name),
        join(GENERATED_TYPES_DIRECTORY, name),
      );
    }
    return { status: 0, outputsHash };
  } finally {
    rmSync(snapshotPath, { force: true });
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

async function ensureTypes(options: EnsureOptions): Promise<number> {
  const sourceDigest = createSourceFingerprint();
  const generatorDigest = createTypeGeneratorFingerprint();
  const state = readGenerationState();

  const reason = stalenessReason(state, sourceDigest, generatorDigest);
  if (!options.forceLocal && reason === undefined) {
    return 0;
  }
  log(
    options.forceLocal
      ? "regenerating from local source (forced)"
      : `regenerating API types (${reason})`,
  );

  const acquisition = await acquireCurrentSpec(options, reason);
  if (acquisition.status !== 0 || acquisition.spec === undefined) {
    return acquisition.status || 1;
  }
  const spec = acquisition.spec;

  const createState = (outputsHash: string): GenerationState => ({
    version: GENERATION_STATE_VERSION,
    ...(spec.sourceDigest !== undefined
      ? { sourceDigest: spec.sourceDigest }
      : {}),
    generatorDigest,
    specHash: spec.hash,
    outputsHash,
  });

  const currentOutputsHash = createOutputsHash();
  const outputsAreReusable =
    !options.forceLocal &&
    state !== undefined &&
    state.generatorDigest === generatorDigest &&
    state.specHash === spec.hash &&
    state.outputsHash === currentOutputsHash &&
    currentOutputsHash !== undefined;
  if (outputsAreReusable) {
    writeGenerationStateAtomically(createState(currentOutputsHash));
    return 0;
  }

  const generation = await generateTypes(spec, options);
  if (generation.status !== 0 || generation.outputsHash === undefined) {
    return generation.status || 1;
  }
  writeGenerationStateAtomically(createState(generation.outputsHash));
  return 0;
}

export async function main(
  arguments_ = process.argv.slice(2),
): Promise<number> {
  let options: EnsureOptions;
  try {
    options = parseOptions(arguments_);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`error: ${message}`);
    return 1;
  }

  if (options.postinstall) {
    return freshBeforePostinstall() ? 0 : startPostinstallWorker();
  }

  let status: number;
  try {
    const outcome = await withGenerationLock(
      GENERATION_LOCK_PATH,
      {
        wait: !options.postinstallWorker,
        maxWaitMs: MAX_LOCK_WAIT_MS,
        onWait: ({ path, ageMs }) =>
          log(
            `waiting for generation lock (${path}, age ${Math.round(ageMs / 1000)}s); ` +
              `if stuck: rm -rf ${path}`,
          ),
        onWaitTimeout: () =>
          log("generation lock timed out after 60s; continuing without it"),
      },
      () => ensureTypes(options),
    );
    if (!outcome.executed) {
      if (!options.postinstallWorker) {
        log("API type generation is already running");
      }
      return 0;
    }
    status = outcome.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`error: ${message}`);
    status = 1;
  }

  if (status !== 0 && options.postinstallWorker) {
    // Background generation must not fail bun install.
    process.stderr.write(
      "[types:ensure] ⚠ could not generate API types — run `bun run types:ensure` to see the failure\n",
    );
    return 0;
  }
  return status;
}

const currentScriptPath = process.argv[1];
if (
  currentScriptPath !== undefined &&
  resolve(currentScriptPath) === fileURLToPath(import.meta.url)
) {
  process.exit(await main());
}
