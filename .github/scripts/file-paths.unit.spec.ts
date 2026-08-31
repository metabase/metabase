import { readFileSync } from "fs";
import { join } from "path";

import { load } from "js-yaml";

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
});
