import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { getStore, mainReducers } from "__support__/entities-store";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { getRoutes } from "metabase/routes";

import { deriveRoutePreloads } from "./derive-route-preloads";

const GENERATED = join(__dirname, "route-preloads.generated.json");

// The admin routes read settings off the store while the tree is built, so this
// needs a real one. `getRoutes` wants the app's own store type, which the test
// store satisfies at runtime but not on paper.
const store = getStore(mainReducers, {
  settings: createMockSettingsState({}),
}) as unknown as Parameters<typeof getRoutes>[0];

const { rows, unnamed } = deriveRoutePreloads(getRoutes(store));

describe("the route preload table", () => {
  it("matches the checked-in file", () => {
    const generated = `${JSON.stringify(rows, null, 2)}\n`;

    if (process.env.UPDATE_ROUTE_PRELOADS) {
      writeFileSync(GENERATED, generated);
    }

    expect(readFileSync(GENERATED, "utf8")).toBe(generated);
  });

  it("leaves no page in a chunk nothing can name", () => {
    expect(unnamed.map((route) => route.pattern)).toEqual([]);
  });
});
