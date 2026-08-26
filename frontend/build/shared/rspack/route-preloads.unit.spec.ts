import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { getRoutes } from "metabase/routes";

import { collectRouteChunks } from "./derive-route-preloads";
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
