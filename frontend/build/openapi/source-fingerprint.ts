/**
 * Content fingerprints for the OpenAPI generation pipeline.
 *
 * These are deliberately single-pass: files are listed, sorted, and hashed
 * once, with no snapshot-consistency retries. The generation path in
 * ensure-types.ts brackets local spec generation with a before/after digest
 * comparison. Generation assumes source inputs are quiescent; detected edits
 * retry, while an exact edit-and-revert inside the window is outside the
 * freshness guarantee.
 */
import { type Hash, createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join, sep } from "node:path";

export const SOURCE_FINGERPRINT_POLICY = "backend-source-content-v2";
export const TYPE_GENERATOR_FINGERPRINT_POLICY = "hey-api-inputs-v2";

const SOURCE_ROOTS = ["src", "enterprise/backend/src"];
/** Directories whose immediate children may contain a deps.edn. */
const DEPS_PARENT_ROOTS = ["modules/drivers", "bin"];
const OPTIONAL_SOURCE_PATHS = [
  "resources/data_readers.clj",
  "resources/locales.clj",
  "resources/version.properties",
];
const TYPE_GENERATOR_PATHS = [
  "frontend/build/openapi/openapi-ts.config.ts",
  "package.json",
  "bun.lock",
];
const EE_GENERATION_SETTINGS =
  "edition=ee\ncommand=clojure -M:run:ee generate-openapi-spec";

interface FingerprintRecord {
  kind: "file" | "symlink" | "missing";
  path: string;
  contents: Buffer;
}

function normalizePath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function listTreeFiles(repositoryRoot: string, relativeRoot: string): string[] {
  const absoluteRoot = join(repositoryRoot, relativeRoot);
  let stats;
  try {
    stats = lstatSync(absoluteRoot);
  } catch {
    return [];
  }
  if (stats.isFile() || stats.isSymbolicLink()) {
    return [relativeRoot];
  }
  if (!stats.isDirectory()) {
    return [];
  }
  let names: string[];
  try {
    names = readdirSync(absoluteRoot);
  } catch {
    return [];
  }
  return names.flatMap((name) =>
    listTreeFiles(repositoryRoot, join(relativeRoot, name)),
  );
}

function listDepsFiles(repositoryRoot: string): string[] {
  const paths = ["deps.edn"];
  for (const parentRoot of DEPS_PARENT_ROOTS) {
    let names: string[] = [];
    try {
      names = readdirSync(join(repositoryRoot, parentRoot));
    } catch {
      // The parent directory is optional.
    }
    paths.push(...names.map((name) => join(parentRoot, name, "deps.edn")));
  }
  return paths;
}

function readRecord(repositoryRoot: string, path: string): FingerprintRecord {
  const normalizedPath = normalizePath(path);
  const absolutePath = join(repositoryRoot, path);
  try {
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      return {
        kind: "symlink",
        path: normalizedPath,
        contents: Buffer.from(readlinkSync(absolutePath)),
      };
    }
    if (stats.isFile()) {
      return {
        kind: "file",
        path: normalizedPath,
        contents: readFileSync(absolutePath),
      };
    }
  } catch {
    // Deleted or unreadable mid-walk; fall through to "missing".
  }
  return { kind: "missing", path: normalizedPath, contents: Buffer.alloc(0) };
}

function writeFrame(hash: Hash, value: string | Buffer): void {
  const contents = typeof value === "string" ? Buffer.from(value) : value;
  const frame = Buffer.alloc(8);
  frame.writeBigUInt64BE(BigInt(contents.byteLength));
  // Hex round-trips keep typescript7's stricter BinaryLike checks happy.
  hash.update(frame.toString("hex"), "hex");
  hash.update(contents.toString("hex"), "hex");
}

function createFingerprint(
  repositoryRoot: string,
  policy: string,
  paths: string[],
  additionalRecords: FingerprintRecord[] = [],
): string {
  const uniqueSortedPaths = [...new Set(paths.map(normalizePath))].sort();
  const hash = createHash("sha256");
  const records = [
    ...additionalRecords,
    ...uniqueSortedPaths.map((path) => readRecord(repositoryRoot, path)),
  ];
  for (const record of records) {
    writeFrame(hash, policy);
    writeFrame(hash, record.kind);
    writeFrame(hash, record.path);
    writeFrame(hash, record.contents);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function createSourceFingerprint(
  repositoryRoot = process.cwd(),
): string {
  const paths = [
    ...SOURCE_ROOTS.flatMap((root) => listTreeFiles(repositoryRoot, root)),
    ...listDepsFiles(repositoryRoot),
    ...OPTIONAL_SOURCE_PATHS,
  ];
  return createFingerprint(repositoryRoot, SOURCE_FINGERPRINT_POLICY, paths, [
    {
      kind: "file",
      path: "@ee-generation-settings",
      contents: Buffer.from(EE_GENERATION_SETTINGS),
    },
  ]);
}

export function createTypeGeneratorFingerprint(
  repositoryRoot = process.cwd(),
): string {
  return createFingerprint(
    repositoryRoot,
    TYPE_GENERATOR_FINGERPRINT_POLICY,
    TYPE_GENERATOR_PATHS,
  );
}
