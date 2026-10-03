import fs from "fs";
import path from "path";

import {
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_PATHS,
} from "../../build/shared/rspack/side-effect-free-modules";

// A directory in SIDE_EFFECT_FREE_PATHS promises rspack that importing any file
// in it, and using none of its exports, has no observable effect. Rspack cannot
// verify that. When the promise breaks, production silently drops code that was
// meant to run, while dev and jest keep working, and no size budget catches it
// because dropping more is never a size failure.
//
// The contents are checked by the `metabase/no-module-side-effects` lint rule,
// which eslint.config.mjs applies to every directory in the list. This only
// checks that the lists still point at real files, since a stale entry silently
// stops applying after a move.

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function hasSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory()
      ? hasSourceFiles(entryPath)
      : SOURCE_EXTENSIONS.includes(path.extname(entry.name));
  });
}

it.each(SIDE_EFFECT_FREE_PATHS)(
  "side-effect-free directory %s has source files (a moved directory should be removed from the list)",
  (dir) => {
    expect(hasSourceFiles(dir)).toBe(true);
  },
);

// The paths that opt back out must exist, otherwise the exclusion silently
// stops applying after a move and the effect they carry becomes shakeable.
// A directory entry ends with a separator and must still hold source files.
for (const entry of SIDE_EFFECT_PATHS) {
  it(`side-effect path ${entry} exists`, () => {
    const exists = entry.endsWith(path.sep)
      ? hasSourceFiles(entry)
      : fs.statSync(entry).isFile();
    expect(exists).toBe(true);
  });
}
