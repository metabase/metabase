import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { getRoutes } from "metabase/routes";

import { collectRouteChunks } from "./derive-route-preloads";
import { deriveRoutePreloads } from "./route-preloads/derive";

// The admin routes read settings off the store while the tree is built, so this
// needs a real one. `getRoutes` wants the app's own store type, which the test
// store satisfies at runtime but not on paper.
const store = getStore(mainReducers, {
  settings: createMockSettingsState({}),
}) as unknown as Parameters<typeof getRoutes>[0];

const executed = collectRouteChunks(getRoutes(store));
const derived = deriveRoutePreloads(process.cwd());

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
    const found = new Set(derived.routes.map(key));
    const missing = executed.routes
      .map(key)
      .filter((route) => !found.has(route));

    expect(missing).toEqual([]);
  });

  /**
   * The reverse is allowed. Conditionals are over-approximated, so routes behind
   * a token feature are derived but absent from a tree built without plugins.
   * A row nobody matches costs nothing; a missing row costs a slow page.
   */
  it("may find routes the built tree does not", () => {
    const built = new Set(executed.routes.map(key));

    expect(
      derived.routes.filter((route) => !built.has(key(route))).length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("leaves no page in a chunk nothing can name", () => {
    expect(executed.unnamed.map((route) => route.pattern)).toEqual([]);
  });
});
