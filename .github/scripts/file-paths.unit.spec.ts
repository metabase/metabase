import { readFileSync } from "fs";
import { join } from "path";

import { load } from "js-yaml";
import { isMatch } from "micromatch";

const FILTERS = join(__dirname, "..", "file-paths.yaml");

type Filter = string | Filter[] | { [changeType: string]: Filter };

// A filter is a list of patterns, and an entry may name the change types it applies to as
// { "added|modified": pattern }. Either way the patterns are what matters here.
const patterns = (value: Filter): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(patterns);
  }
  return Object.values(value).flatMap(patterns);
};

describe("file-paths.yaml", () => {
  // js-yaml returns an untyped value, and this repository file defines named path filters.
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
  // ratchet files out with ".clj-kondo/**/!(ratchets.edn)".
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
      expect(matches(name, ".clj-kondo/config/modules/ratchets.edn")).toBe(
        false,
      );
      expect(matches(name, ".clj-kondo/config.edn")).toBe(true);
      expect(matches(name, ".clj-kondo/config/modules/config.edn")).toBe(true);
    },
  );

  it("runs CI script tests when the Node version changes", () => {
    expect(matches("ci_scripts", ".nvmrc")).toBe(true);
  });

  it.each([
    "jest.config.js",
    "jest.base.conf.js",
    "jest.esm-packages.js",
    "jest.tz.unit.conf.js",
  ])("runs every frontend unit test when %s changes", (path) => {
    expect(matches("frontend_specs", path)).toBe(true);
    expect(matches("frontend_unit_infra", path)).toBe(true);
  });

  it("runs every frontend unit test when an SDK jest setup file changes", () => {
    expect(
      matches(
        "frontend_unit_infra",
        "frontend/src/embedding-sdk-shared/jest/setup-env.ts",
      ),
    ).toBe(true);
  });

  it.each([
    "jest.config.js",
    "jest.base.conf.js",
    "jest.esm-packages.js",
    ".storybook/story-files.cjs",
    ".github/workflows/loki.yml",
  ])("runs CI script tests when %s changes", (path) => {
    expect(matches("ci_scripts", path)).toBe(true);
  });

  it("runs the ratchet check on the ratchets file", () => {
    expect(matches("project_ratchet_checks", ".clj-kondo/ratchets.edn")).toBe(
      true,
    );
    expect(
      matches(
        "project_ratchet_checks",
        ".clj-kondo/config/modules/ratchets.edn",
      ),
    ).toBe(true);
  });

  it.each([
    "loki.config.js",
    ".storybook/story-files.cjs",
    ".storybook/preview.tsx",
    ".loki/reference/chrome.laptop-Button.png",
    ".github/workflows/loki.yml",
    ".github/workflows/run-tests.yml",
    ".github/actions/prepare-frontend/action.yml",
    "frontend/build/shared/rspack/css-config.js",
    "frontend/test/__support__/custom-viz-fixtures/calendar-heatmap/index.js",
    "patches/@loki+browser+0.35.0.patch",
    "frontend/src/metabase/css/index.module.css",
    "frontend/src/metabase/css/core/base.module.css",
    "resources/frontend_client/app/fonts/Lato/lato-v16-latin-regular.woff2",
    "resources/frontend_client/app/assets/img/no_results.svg",
    "frontend/src/metabase/ui/components/icons/Icon/icons/warning.svg",
    "enterprise/frontend/src/metabase-enterprise/google_drive/database-error.svg",
  ])("runs all Loki stories when %s changes", (file) => {
    expect(matches("frontend_loki_all", file)).toBe(true);
    expect(matches("frontend_loki_infra", file)).toBe(true);
  });

  it.each([
    "frontend/src/metabase/ui/Button.stories.tsx",
    "frontend/src/metabase/ui/components/feedback/Alert/Alert.module.css",
    "frontend/build/embedding-sdk/rspack.config.js",
  ])("allows a change to %s to narrow the Loki run", (file) => {
    expect(matches("frontend_loki_all", file)).toBe(true);
    expect(matches("frontend_loki_infra", file)).toBe(false);
  });

  it.each([
    ".github/workflows/frontend.yml",
    "frontend/test/metabase/scenarios/Button.unit.spec.tsx",
  ])("does not run Loki stories when %s changes", (file) => {
    expect(matches("frontend_loki_all", file)).toBe(false);
  });
});
