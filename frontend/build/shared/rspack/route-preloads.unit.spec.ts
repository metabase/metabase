import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { getRoutes } from "metabase/routes";

import { collectRouteChunks } from "./derive-route-preloads";
import { preloadRows } from "./route-preloads-rows";
import { readRoutes } from "./routes";

// The admin routes read settings off the store while the tree is built, so this
// needs a real one. `getRoutes` wants the app's own store type, which the test
// store satisfies at runtime but not on paper.
const store = getStore(mainReducers, {
  settings: createMockSettingsState({}),
}) as unknown as Parameters<typeof getRoutes>[0];

const executed = collectRouteChunks(getRoutes(store));
const derived = readRoutes(process.cwd());

const key = ({ pattern, chunks }: { pattern: string; chunks: string[] }) =>
  `${pattern} -> ${[...chunks].sort().join("+")}`;

describe("the route preload manifest", () => {
  /**
   * The build derives the manifest by reading source, because importing the app
   * would need the asset loaders and the ClojureScript build. Reading source can
   * only miss an idiom it has not been taught, and nothing about a missing row is
   * visible at a glance. Building the real tree here is the check on that.
   */
  it("covers every route that building the tree finds", () => {
    const found = new Set(
      derived.routes
        .filter((route: { chunks: string[] }) => route.chunks.length > 0)
        .map(key),
    );
    const missing = executed.routes
      .map(key)
      .filter((route) => !found.has(route));

    expect(missing).toEqual([]);
  });

  /**
   * Reading source reports every route, not only the ones that load a chunk, so
   * a caller can ask what parameters a URL takes. A route type generator would
   * read exactly this.
   */
  it("reads the parameters a URL takes", () => {
    const withParams = derived.routes.filter(
      (route: { params: string[] }) => route.params.length > 0,
    );

    expect(withParams.length).toBeGreaterThan(50);
  });

  it("leaves no page in a chunk nothing can name", () => {
    expect(executed.unnamed.map((route) => route.pattern)).toEqual([]);
  });
});

type Row = { patterns: string[]; chunks: string[] };
type Route = { pattern: string; chunks: string[] };

/**
 * The subset of clout the generator emits: `:name` takes one segment, `*` takes
 * the rest. The backend uses clout itself; this mirrors it well enough to check
 * which row a URL lands on.
 */
function matches(pattern: string, path: string) {
  const source = pattern
    .split("/")
    .map((segment) => {
      if (segment === "*") {
        return "(?:.*)";
      }
      if (segment.startsWith(":")) {
        return "[^/]+";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return new RegExp(`^${source}$`).test(path);
}

const urlFor = (pattern: string) =>
  pattern
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "1" : segment === "*" ? "x" : segment,
    )
    .join("/") || "/";

/**
 * The backend takes the first row that matches and writes only that one, so
 * every row has to carry its ancestors' chunks as well as its own. Rows are
 * sorted deepest first, which is what makes the most specific row win.
 *
 * Concatenating every matching row instead would be worse: `/question/ask` also
 * matches `/question/*`, so it would pull the query builder that page never
 * renders.
 */
describe("the first row a URL matches", () => {
  const rows: Row[] = preloadRows(derived.routes);

  // Routes sharing a URL render together, so the URL needs their chunks united.
  const needed = new Map<string, Set<string>>();
  // `readRoutes` is plain JavaScript, so its rows arrive untyped here.
  for (const route of derived.routes as Route[]) {
    if (route.chunks.length === 0) {
      continue;
    }
    const url = urlFor(route.pattern);
    needed.set(url, new Set([...(needed.get(url) ?? []), ...route.chunks]));
  }

  const compare = (want: Set<string>, url: string) => {
    const hit = rows.find((row) => row.patterns.some((p) => matches(p, url)));
    const got = new Set(hit ? hit.chunks : []);
    return {
      missing: [...want].filter((chunk) => !got.has(chunk)),
      extra: [...got].filter((chunk) => !want.has(chunk)),
    };
  };

  const report = (pick: "missing" | "extra") =>
    [...needed]
      .map(([url, want]) => [url, compare(want, url)[pick]] as const)
      .filter(([, chunks]) => chunks.length > 0)
      .map(([url, chunks]) => `${url} ${chunks.join("+")}`);

  /**
   * A missing chunk costs a slow page. The three below are one Data Studio
   * subtree, where `coalesce` gives a `/*` fallback the chunks of the route that
   * owns the node rather than of everything under it. Fixing that trades these
   * for the opposite error, so it is left as it is and pinned here.
   */
  it("carries every chunk the URL needs, bar one known gap", () => {
    expect(report("missing")).toEqual([
      "/data-studio/data/database/1/schema/1/table/1 data-model",
    ]);
  });

  it("hints nothing the URL does not use, bar two known extras", () => {
    expect(report("extra")).toEqual([
      "/data-studio/data/database/1/schema/1/table/1/settings data-model",
      "/data-studio/data/database/1/schema/1/table/1/field/1/1 data-model",
    ]);
  });
});
