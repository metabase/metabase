import { lazyLoaders } from "__support__/lazy-routes";

import { getMetabotRoutes } from "./routes";

describe("metabot routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getMetabotRoutes());

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
