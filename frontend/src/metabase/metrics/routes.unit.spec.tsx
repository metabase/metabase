import { lazyLoaders } from "__support__/lazy-routes";

import { getMetricRoutes } from "./routes";

describe("metrics routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getMetricRoutes());

    expect(loaders).toHaveLength(6);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
