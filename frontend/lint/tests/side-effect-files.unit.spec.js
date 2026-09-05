import fs from "fs";
import path from "path";

import {
  diffRegistry,
  enforcedStale,
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

  it("lists every file the rule reports, with no stale global or entry entries", () => {
    const { missing, stale } = diffRegistry(registry, effectFiles);
    const report = [
      ...missing.map(
        (file) =>
          `${file} gained an import-time effect: run \`bun frontend/lint/scripts/side-effect-files.js --update\`, then classify the new entry`,
      ),
      ...enforcedStale(registry, stale).map(
        (file) =>
          `${file} no longer has an import-time effect: remove its entry with \`bun frontend/lint/scripts/side-effect-files.js --update\``,
      ),
    ];
    expect(report).toEqual([]);
  });

  it("fails a stale global or entry entry but tolerates a stale self one", () => {
    const stubRegistry = {
      facades: [],
      files: {
        "frontend/src/clean-entry.ts": "entry",
        "frontend/src/clean-global.ts": "global",
        "frontend/src/clean-self.ts": "self",
        "frontend/src/effect-file.ts": "global",
      },
      packages: {},
      patterns: [],
      unclassified: new Set(),
    };
    const { stale } = diffRegistry(stubRegistry, [
      "frontend/src/effect-file.ts",
    ]);
    // diffRegistry reports all three, so --update prunes the self entry too.
    expect(stale).toEqual([
      "frontend/src/clean-entry.ts",
      "frontend/src/clean-global.ts",
      "frontend/src/clean-self.ts",
    ]);
    expect(enforcedStale(stubRegistry, stale)).toEqual([
      "frontend/src/clean-entry.ts",
      "frontend/src/clean-global.ts",
    ]);
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
