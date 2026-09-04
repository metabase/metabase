/**
 * Stores the hashes used to decide whether generated OpenAPI types are current.
 *
 * The state covers backend source, generator inputs, the OpenAPI spec, and the
 * generated declarations. State from a running backend omits the source hash
 * because the source loaded by that process can't be observed. Missing or
 * invalid state triggers regeneration.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const GENERATION_STATE_VERSION = 1;

export interface GenerationState {
  version: typeof GENERATION_STATE_VERSION;
  /** Absent for backend-origin specs; see module docs. */
  sourceDigest?: string;
  generatorDigest: string;
  specHash: string;
  outputsHash: string;
}

export const GENERATION_STATE_PATH = ".tmp/openapi/generation.json";
export const GENERATED_TYPES_DIRECTORY = "frontend/src/metabase-types/openapi";
export const GENERATED_OUTPUT_NAMES = ["types.gen.d.ts", "index.ts"] as const;

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createContentHash(contents: string | Buffer): string {
  const hash = createHash("sha256");
  if (typeof contents === "string") {
    hash.update(contents);
  } else {
    // Hex round-trips keep typescript7's stricter BinaryLike checks happy.
    hash.update(contents.toString("hex"), "hex");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function readGenerationState(
  path = GENERATION_STATE_PATH,
): GenerationState | undefined {
  try {
    const record: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(record) || record.version !== GENERATION_STATE_VERSION) {
      return undefined;
    }
    if (
      !isHash(record.generatorDigest) ||
      !isHash(record.specHash) ||
      !isHash(record.outputsHash) ||
      (record.sourceDigest !== undefined && !isHash(record.sourceDigest))
    ) {
      return undefined;
    }
    return {
      version: GENERATION_STATE_VERSION,
      ...(isHash(record.sourceDigest)
        ? { sourceDigest: record.sourceDigest }
        : {}),
      generatorDigest: record.generatorDigest,
      specHash: record.specHash,
      outputsHash: record.outputsHash,
    };
  } catch {
    return undefined;
  }
}

export function writeGenerationStateAtomically(
  state: GenerationState,
  path = GENERATION_STATE_PATH,
): void {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let fileDescriptor: number | undefined;
  mkdirSync(dirname(path), { recursive: true });
  try {
    fileDescriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(fileDescriptor, `${JSON.stringify(state, null, 2)}\n`);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    renameSync(temporaryPath, path);
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
    rmSync(temporaryPath, { force: true });
  }
}

/** Hash of the generated declaration outputs, or undefined if any is missing. */
export function createOutputsHash(
  typesDirectory = GENERATED_TYPES_DIRECTORY,
): string | undefined {
  const hash = createHash("sha256");
  for (const name of GENERATED_OUTPUT_NAMES) {
    try {
      const contents = readFileSync(join(typesDirectory, name));
      hash.update(name);
      // Hex round-trips keep typescript7's stricter BinaryLike checks happy.
      hash.update(contents.toString("hex"), "hex");
    } catch {
      return undefined;
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * A shallow shape check plus the one distinction that matters: an EE spec
 * includes `/api/ee/` routes; an OSS backend's spec does not.
 */
export function getOpenApiEdition(
  specContents: string,
): "ee" | "oss" | undefined {
  try {
    const document: unknown = JSON.parse(specContents);
    if (
      typeof document !== "object" ||
      document === null ||
      !("openapi" in document) ||
      typeof document.openapi !== "string" ||
      !("paths" in document) ||
      typeof document.paths !== "object" ||
      document.paths === null ||
      Array.isArray(document.paths)
    ) {
      return undefined;
    }
    return Object.keys(document.paths).some((path) =>
      path.startsWith("/api/ee/"),
    )
      ? "ee"
      : "oss";
  } catch {
    return undefined;
  }
}
