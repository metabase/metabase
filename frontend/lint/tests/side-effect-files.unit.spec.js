import fs from "fs";
import path from "path";

import {
  diffRegistry,
  listSourceFiles,
  scanEffectFiles,
  unimportedPackages,
} from "../scripts/side-effect-files";
import {
  DEFAULT_REGISTRY_PATH,
  loadRegistry,
  validateRegistry,
} from "../side-effect-registry";

const REPO_ROOT = path.resolve(__dirname, "../../..");

// A side-effect-free directory drops an unused file together with everything only it imports,
// so an import-time effect two files away is lost as silently as one in the file itself.
// The registry records every file the rule reports, classified once by hand, and the rule's
// import check consults it. This scan runs the rule over the whole tree so a new effect file
// anywhere fails CI until it is classified.
describe("side-effect-files.json", () => {
  const registry = loadRegistry(DEFAULT_REGISTRY_PATH);
  const effectFiles = [...scanEffectFiles().keys()];

  it("lists every file the rule reports and nothing else", () => {
    const { missing, stale } = diffRegistry(registry, effectFiles);
    const report = [
      ...missing.map((file) => `unregistered effect file: ${file}`),
      ...stale.map((file) => `registered but clean: ${file}`),
    ];
    // Run `bun frontend/lint/scripts/side-effect-files.js --update`, then classify the new entries.
    expect(report).toEqual([]);
  });

  it("is well formed", () => {
    expect(validateRegistry(registry, effectFiles)).toEqual([]);
  });

  it("only lists packages something imports", () => {
    expect(unimportedPackages(registry, listSourceFiles())).toEqual([]);
  });

  it("only names facades that exist", () => {
    for (const prefix of registry.facades) {
      expect(prefix.endsWith("/")).toBe(true);
      expect(fs.existsSync(path.join(REPO_ROOT, prefix))).toBe(true);
    }
  });
});
