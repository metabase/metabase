import { readFileSync } from "fs";
import { join } from "path";

import { load } from "js-yaml";
import { isMatch } from "micromatch";

const FILTERS = join(__dirname, "..", "file-paths.yaml");

type Filter = string | Filter[] | { [changeType: string]: Filter };

// A filter is a list of patterns, and an entry may name the change types it applies to as
// { "added|modified": pattern }. Either way the patterns are what matters here.
const patterns = (value: Filter): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(patterns);
  return Object.values(value).flatMap(patterns);
};

describe("file-paths.yaml", () => {
  const filters = load(readFileSync(FILTERS, "utf8")) as Record<string, Filter>;

  // dorny/paths-filter matches with picomatch, which micromatch wraps, so this asks the same
  // question CI asks of a changed path.
  const matches = (name: string, path: string) =>
    patterns(filters[name]).some((pattern) =>
      isMatch(path, pattern, { dot: true }),
    );

  // dorny/paths-filter ORs the patterns in a filter, so a "!..." entry does not subtract from the
  // other entries - it matches every path they don't, turning the filter permanently on. Excluding
  // a path means writing the exclusion inside one pattern, the way backend_sources keeps
  // ratchets.edn out with ".clj-kondo/{!(ratchets.edn),*/**}".
  it("never excludes a path with a standalone negation", () => {
    const negated = Object.entries(filters).flatMap(([name, filter]) =>
      patterns(filter)
        .filter((pattern) => pattern.startsWith("!"))
        .map((pattern) => `${name}: ${pattern}`),
    );

    expect(negated).toEqual([]);
  });

  it.each(["backend_sources", "backend_all"])(
    "%s skips a ratchets-only change and still follows the rest of .clj-kondo",
    (name) => {
      expect(matches(name, ".clj-kondo/ratchets.edn")).toBe(false);
      expect(matches(name, ".clj-kondo/config.edn")).toBe(true);
      expect(matches(name, ".clj-kondo/config/modules/config.edn")).toBe(true);
    },
  );

  it("runs the ratchet check on the ratchets file", () => {
    expect(matches("project_ratchet_checks", ".clj-kondo/ratchets.edn")).toBe(
      true,
    );
  });

  it.each([
    "loki.config.js",
    ".storybook/story-files.cjs",
    ".storybook/preview.tsx",
    ".loki/reference/chrome.laptop-Button.png",
    ".github/workflows/loki.yml",
    ".github/workflows/frontend.yml",
    ".github/workflows/run-tests.yml",
    "frontend/build/shared/rspack/css-config.js",
    "frontend/test/__support__/custom-viz-fixtures/calendar-heatmap/index.js",
    "patches/@loki+browser+0.35.0.patch",
  ])("runs all Loki stories when %s changes", (file) => {
    expect(matches("frontend_loki_all", file)).toBe(true);
    expect(matches("frontend_loki_infra", file)).toBe(true);
  });

  it("allows story changes to narrow the Loki run", () => {
    const file = "frontend/src/metabase/ui/Button.stories.tsx";

    expect(matches("frontend_loki_all", file)).toBe(true);
    expect(matches("frontend_loki_infra", file)).toBe(false);
  });

  it("runs CI-script tests when the story inventory changes", () => {
    expect(matches("ci_scripts", ".storybook/story-files.cjs")).toBe(true);
  });
});
