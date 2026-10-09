import { lazyLoaders } from "__support__/lazy-routes";

import { getDataStudioActionRoutes } from "./routes";

describe("data studio action routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioActionRoutes());

    expect(loaders).toHaveLength(9);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
