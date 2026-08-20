import { matchRoutes } from "react-router";

import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { getRoutes } from "metabase/routes";

import { ROUTE_PRELOADS } from "./route-preloads";

type PreloadRoute = { patterns: string[]; example: string; chunks: string[] };

// The admin routes read settings off the store while the tree is built, so this
// needs a real one. `getRoutes` wants the app's own store type, which the test
// store satisfies at runtime but not on paper.
const store = getStore(mainReducers, {
  settings: createMockSettingsState({}),
}) as unknown as Parameters<typeof getRoutes>[0];

const routes = getRoutes(store);

describe("the route preload table", () => {
  // The table is plain JavaScript, so its rows arrive untyped here.
  it.each(ROUTE_PRELOADS as PreloadRoute[])(
    "$example matches a route that loads its page on demand",
    ({ example }) => {
      const matches = matchRoutes(routes, example);

      expect(matches).not.toBeNull();
      expect(matches?.some((match) => match.route.lazy)).toBe(true);
    },
  );
});
