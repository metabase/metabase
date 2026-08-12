import fs from "fs";
import path from "path";

import {
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_FULL_FILES,
} from "../../build/shared/rspack/side-effect-free-modules";

// A directory in SIDE_EFFECT_FREE_PATHS promises rspack that importing any file
// in it, and using none of its exports, has no observable effect. Rspack cannot
// verify that. When the promise breaks, production silently drops code that was
// meant to run, while dev and jest keep working, and no size budget catches it
// because dropping more is never a size failure.
//
// The half of the contract that is mechanically detectable is import-time effects,
// which is what this covers. Whether a top-level call is pure still needs a human.

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

// Neither reaches a production bundle, so neither is bound by the contract.
const NON_BUNDLED = [".unit.spec.", ".stories."];

function filesIn(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return filesIn(entryPath, extensions);
    }
    return extensions.includes(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function sourceFilesIn(dir) {
  return filesIn(dir, SOURCE_EXTENSIONS).filter(
    (file) =>
      !NON_BUNDLED.some((marker) => file.includes(marker)) &&
      !SIDE_EFFECT_FULL_FILES.includes(file),
  );
}

// `import "./x"` and `require("./x")`, which exist only for their side effects.
const BARE_IMPORT =
  /^\s*(?:import\s+["'][^"']+["']|require\(["'][^"']+["']\))/m;
// Assets pulled in for their effect on the page rather than for a binding.
// Stylesheets are absent: `modules.auto` in `css-config.js` scopes every one of
// them, so a bound stylesheet import contributes only the class names it exports,
// and a bare one is already a BARE_IMPORT.
const ASSET_IMPORT = /^\s*import\s+[^;]*["'][^"']+\.(?:svg|png|jpe?g)["']/m;

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
// Selectors a CSS module leaves global, which outlive the class names it exports
// and so would go missing with the importer rather than with a reference to them.
const UNSCOPED_SELECTOR =
  /^\s*(?::global\b|:root\b|html\b|body\b|@font-face\b|\*)/m;

describe.each(SIDE_EFFECT_FREE_PATHS)("side-effect-free %s", (dir) => {
  const files = sourceFilesIn(dir);
  const stylesheets = filesIn(dir, [".css"]);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s has no import-time side effects", (file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(BARE_IMPORT.test(source)).toBe(false);
    expect(ASSET_IMPORT.test(source)).toBe(false);
  });

  // Not every side-effect-free directory has stylesheets, and `it.each` rejects an
  // empty table.
  if (stylesheets.length > 0) {
    it.each(stylesheets)("%s keeps every rule scoped", (file) => {
      const source = fs.readFileSync(file, "utf8").replace(CSS_COMMENT, "");
      expect(UNSCOPED_SELECTOR.test(source)).toBe(false);
    });
  }
});

// A renamed or moved file would drop off this list silently, putting it back under
// `sideEffects: false` with nothing to catch it.
it.each(SIDE_EFFECT_FULL_FILES)("%s still exists", (file) => {
  expect(fs.existsSync(file)).toBe(true);
});
