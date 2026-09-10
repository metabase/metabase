// A variant folder may import only from "../types", "../shared", and files
// inside its own folder. Spec files are exempt because they need fixtures and
// the contract.
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const HEURISTICS_DIR = __dirname;
const NON_VARIANT_DIRS = new Set(["__fixtures__"]);
const ALLOWED_PARENT_IMPORTS = new Set(["../types", "../shared"]);
const IMPORT_SOURCE_PATTERN = /(?:from|import)\s*["']([^"']+)["']/g;

const isSpecFile = (file: string) => /\.spec\.tsx?$/.test(file);
const isSourceFile = (file: string) =>
  /\.tsx?$/.test(file) && !isSpecFile(file);

function listVariantSourceFiles(): string[] {
  return readdirSync(HEURISTICS_DIR)
    .filter((entry) => !NON_VARIANT_DIRS.has(entry))
    .map((entry) => path.join(HEURISTICS_DIR, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .flatMap((dir) =>
      readdirSync(dir)
        .filter(isSourceFile)
        .map((file) => path.join(dir, file)),
    );
}

function readImportSources(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT_SOURCE_PATTERN)].map(([, spec]) => spec);
}

const isAllowed = (spec: string) =>
  ALLOWED_PARENT_IMPORTS.has(spec) || spec.startsWith("./");

describe("variant imports", () => {
  const files = listVariantSourceFiles();

  it("finds variant source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.relative(HEURISTICS_DIR, file), file]))(
    "%s imports only ../types, ../shared, or its own folder",
    (_name, file) => {
      const forbidden = readImportSources(file).filter(
        (spec) => !isAllowed(spec),
      );
      expect(forbidden).toEqual([]);
    },
  );
});
