import { getStore, mainReducers } from "__support__/entities-store";
import { lazyLoaders } from "__support__/lazy-routes";

import { getAccountRoutes } from "./routes";

const Guard = () => null;

describe("account routes", () => {
  it("resolves every page", async () => {
    const store = getStore(mainReducers, {});
    const loaders = lazyLoaders(getAccountRoutes(store, Guard));

    expect(loaders).toHaveLength(4);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
