import { lazyLoaders } from "__support__/lazy-routes";

import { getDataStudioTransformRoutes } from "./routes";

describe("transforms routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioTransformRoutes());

    // 17, not 18: the dependencies route is behind a plugin flag that is off here.
    expect(loaders).toHaveLength(17);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
