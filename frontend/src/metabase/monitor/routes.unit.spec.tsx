import { lazyLoaders } from "__support__/lazy-routes";

import { getMonitorRoutes } from "./routes";

describe("monitor routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getMonitorRoutes());

    expect(loaders).toHaveLength(6);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
