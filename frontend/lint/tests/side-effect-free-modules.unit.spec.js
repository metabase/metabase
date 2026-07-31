import fs from "fs";
import path from "path";

import { SIDE_EFFECT_FREE_PATHS } from "../../build/shared/rspack/side-effect-free-modules";

// A directory in SIDE_EFFECT_FREE_PATHS promises rspack that importing any file
// in it, and using none of its exports, has no observable effect. Rspack cannot
// verify that. When the promise breaks, production silently drops code that was
// meant to run, while dev and jest keep working, and no size budget catches it
// because dropping more is never a size failure.
//
// The half of the contract that is mechanically detectable is import-time effects,
// which is what this covers. Whether a top-level call is pure still needs a human.

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function sourceFilesIn(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return sourceFilesIn(entryPath);
      }
      return SOURCE_EXTENSIONS.includes(path.extname(entry.name))
        ? [entryPath]
        : [];
    })
    .filter((file) => !file.includes(".unit.spec."));
}

// `import "./x"` and `require("./x")`, which exist only for their side effects.
const BARE_IMPORT =
  /^\s*(?:import\s+["'][^"']+["']|require\(["'][^"']+["']\))/m;
// Assets pulled in for their effect on the page rather than for a binding.
const ASSET_IMPORT = /^\s*import\s+[^;]*["'][^"']+\.(?:css|svg|png|jpe?g)["']/m;

describe.each(SIDE_EFFECT_FREE_PATHS)("side-effect-free %s", (dir) => {
  const files = sourceFilesIn(dir);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s has no import-time side effects", (file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(BARE_IMPORT.test(source)).toBe(false);
    expect(ASSET_IMPORT.test(source)).toBe(false);
  });
});
