import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GENERATION_STATE_VERSION,
  type GenerationState,
  createContentHash,
  createOutputsHash,
  getOpenApiEdition,
  readGenerationState,
  writeGenerationStateAtomically,
} from "./generation-state";

const EE_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Metabase API", version: "v1.0.0" },
  paths: {
    "/api/user": { get: { responses: { "200": {} } } },
    "/api/ee/scim/v2/Users": { get: { responses: { "200": {} } } },
  },
});

const OSS_SPEC = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Metabase API", version: "v1.0.0" },
  paths: {
    "/api/user": { get: { responses: { "200": {} } } },
  },
});

describe("generation state", () => {
  let directory: string;
  let statePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "generation-state-"));
    statePath = join(directory, "nested", "generation.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("round-trips a state with a source digest", () => {
    const state: GenerationState = {
      version: GENERATION_STATE_VERSION,
      sourceDigest: createContentHash("source"),
      generatorDigest: createContentHash("generator"),
      specHash: createContentHash("spec"),
      outputsHash: createContentHash("outputs"),
    };
    writeGenerationStateAtomically(state, statePath);
    expect(readGenerationState(statePath)).toEqual(state);
  });

  it("round-trips a backend-origin state without a source digest", () => {
    const state: GenerationState = {
      version: GENERATION_STATE_VERSION,
      generatorDigest: createContentHash("generator"),
      specHash: createContentHash("spec"),
      outputsHash: createContentHash("outputs"),
    };
    writeGenerationStateAtomically(state, statePath);
    const readBack = readGenerationState(statePath);
    expect(readBack).toEqual(state);
    expect(readBack?.sourceDigest).toBeUndefined();
  });

  it("returns undefined for missing, malformed, or old-schema files", () => {
    expect(readGenerationState(statePath)).toBeUndefined();

    mkdirSync(join(statePath, ".."), { recursive: true });
    writeFileSync(statePath, "not json");
    expect(readGenerationState(statePath)).toBeUndefined();

    writeFileSync(
      statePath,
      JSON.stringify({ schemaVersion: 2, source: {}, spec: {}, types: {} }),
    );
    expect(readGenerationState(statePath)).toBeUndefined();

    writeFileSync(
      statePath,
      JSON.stringify({
        version: GENERATION_STATE_VERSION,
        generatorDigest: "not-a-hash",
      }),
    );
    expect(readGenerationState(statePath)).toBeUndefined();
  });
});

describe("createOutputsHash", () => {
  let typesDirectory: string;

  beforeEach(() => {
    typesDirectory = mkdtempSync(join(tmpdir(), "generation-outputs-"));
  });

  afterEach(() => {
    rmSync(typesDirectory, { recursive: true, force: true });
  });

  it("returns undefined when either output file is missing", () => {
    expect(createOutputsHash(typesDirectory)).toBeUndefined();
    writeFileSync(join(typesDirectory, "index.ts"), "export {};");
    expect(createOutputsHash(typesDirectory)).toBeUndefined();
  });

  it("changes when an output changes", () => {
    writeFileSync(join(typesDirectory, "index.ts"), "export {};");
    writeFileSync(join(typesDirectory, "types.gen.d.ts"), "export type A = 1;");
    const before = createOutputsHash(typesDirectory);
    expect(before).toMatch(/^sha256:[a-f0-9]{64}$/);

    writeFileSync(join(typesDirectory, "types.gen.d.ts"), "export type A = 2;");
    expect(createOutputsHash(typesDirectory)).not.toBe(before);
  });
});

describe("getOpenApiEdition", () => {
  it("classifies EE and OSS specs", () => {
    expect(getOpenApiEdition(EE_SPEC)).toBe("ee");
    expect(getOpenApiEdition(OSS_SPEC)).toBe("oss");
  });

  it("rejects non-JSON and shapeless JSON", () => {
    expect(getOpenApiEdition("not json")).toBeUndefined();
    expect(getOpenApiEdition("{}")).toBeUndefined();
    expect(
      getOpenApiEdition(JSON.stringify({ openapi: "3.1.0" })),
    ).toBeUndefined();
    expect(
      getOpenApiEdition(JSON.stringify({ openapi: "3.1.0", paths: [] })),
    ).toBeUndefined();
  });
});
