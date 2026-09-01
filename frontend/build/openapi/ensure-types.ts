#!/usr/bin/env bun
/**
 * Ensures generated API types (frontend/src/metabase-types/openapi/) exist
 * and represent the complete Enterprise API.
 *
 * Source selection:
 *   1. Running EE backend — use its live document, including evaluated schema changes
 *   2. Running OSS backend — reload saved local changes with the EE classpath to produce a complete document
 *   3. No backend — bundle the committed EE specification
 *
 * --tolerant is used by postinstall and may keep existing types when they appear current.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  type GenerationSource,
  createGenerationSource,
  createSpecHash,
  getOpenApiEdition,
  parseGenerationSource,
} from "./generation-source";

const SPEC_PATH = ".tmp/openapi/openapi.json";
const SPLIT_SPEC_DIR = "frontend/build/openapi/spec";
const SPLIT_SPEC_PATH = `${SPLIT_SPEC_DIR}/openapi.json`;
const TYPES_DIR = "frontend/src/metabase-types/openapi";
const TYPES_PATH = `${TYPES_DIR}/types.gen.d.ts`;
const GENERATION_SOURCE_PATH = `${TYPES_DIR}/.generation.json`;
const BACKEND_URL = `http://localhost:${process.env.MB_JETTY_PORT ?? 3000}/api/docs/openapi.json`;

const tolerant = process.argv.includes("--tolerant");

function log(message: string) {
  // eslint-disable-next-line no-console
  console.log(`[types:ensure] ${message}`);
}

function runScript(name: string): number {
  const result = spawnSync("bun", ["run", name], { stdio: "inherit" });
  return result.status ?? 1;
}

function newestModificationTime(dir: string): number {
  let newest = 0;
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else {
        newest = Math.max(newest, statSync(path).mtimeMs);
      }
    }
  };
  visit(dir);
  return newest;
}

function committedSpecIsNewerThanTypes(): boolean {
  if (!existsSync(SPLIT_SPEC_PATH) || !existsSync(TYPES_PATH)) {
    return false;
  }
  return newestModificationTime(SPLIT_SPEC_DIR) > statSync(TYPES_PATH).mtimeMs;
}

function readGenerationSource(): GenerationSource | undefined {
  if (!existsSync(GENERATION_SOURCE_PATH)) {
    return undefined;
  }

  try {
    return parseGenerationSource(readFileSync(GENERATION_SOURCE_PATH, "utf8"));
  } catch {
    return undefined;
  }
}

function writeGenerationSource(specContents: string) {
  const source = createGenerationSource("ee", specContents);
  const temporaryPath = `${GENERATION_SOURCE_PATH}.${process.pid}.tmp`;
  mkdirSync(TYPES_DIR, { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(source, null, 2)}\n`);
  renameSync(temporaryPath, GENERATION_SOURCE_PATH);
}

async function fetchSpecFromBackend(): Promise<string | undefined> {
  try {
    const response = await fetch(BACKEND_URL, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      return undefined;
    }

    const body = await response.text();
    return getOpenApiEdition(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

function finish(status: number): never {
  if (status !== 0 && tolerant) {
    log(
      "⚠ could not generate API types — run `bun run types:ensure` to see the failure",
    );
    process.exit(0);
  }
  process.exit(status);
}

function generateTypesFromCurrentSpec(): never {
  let specContents: string;
  try {
    specContents = readFileSync(SPEC_PATH, "utf8");
  } catch {
    log(`error: OpenAPI document not found at ${SPEC_PATH}`);
    finish(1);
  }

  if (getOpenApiEdition(specContents) !== "ee") {
    log(
      "error: refusing to generate incomplete API types from an OSS document",
    );
    finish(1);
  }

  const specHash = createSpecHash(specContents);
  const source = readGenerationSource();
  if (
    existsSync(TYPES_PATH) &&
    source?.edition === "ee" &&
    source.specHash === specHash
  ) {
    log("generated API types already match the complete OpenAPI document");
    finish(0);
  }

  const status = runScript("types:generate");
  if (status === 0) {
    writeGenerationSource(specContents);
  }
  finish(status);
}

function generateFromCommittedSpec(): never {
  if (!existsSync(SPLIT_SPEC_PATH)) {
    log(`error: committed OpenAPI spec not found at ${SPLIT_SPEC_PATH}`);
    finish(1);
  }

  log("generating types from the committed complete OpenAPI spec");
  const bundleStatus = runScript("openapi:bundle");
  if (bundleStatus !== 0) {
    finish(bundleStatus);
  }
  generateTypesFromCurrentSpec();
}

function generateFromLocalSources(): never {
  log(
    "running backend exposes OSS routes only — generating the complete OpenAPI document from local source",
  );
  const generateStatus = runScript("openapi:generate");
  if (generateStatus !== 0) {
    finish(generateStatus);
  }
  generateTypesFromCurrentSpec();
}

const typesExist = existsSync(TYPES_PATH);
const typesAreBehindCommittedSpec =
  typesExist && committedSpecIsNewerThanTypes();

if (tolerant && typesExist && !typesAreBehindCommittedSpec) {
  process.exit(0);
}

const backendSpec = await fetchSpecFromBackend();
if (backendSpec) {
  if (getOpenApiEdition(backendSpec) === "ee") {
    mkdirSync(dirname(SPEC_PATH), { recursive: true });
    writeFileSync(SPEC_PATH, backendSpec);
    log(`fetched complete OpenAPI spec from running backend (${BACKEND_URL})`);
    generateTypesFromCurrentSpec();
  }
  generateFromLocalSources();
}

generateFromCommittedSpec();
