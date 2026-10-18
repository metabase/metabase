import { lazyLoaders } from "__support__/lazy-routes";

import { getDataStudioTransformRoutes } from "./routes";

describe("transforms routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioTransformRoutes());

    expect(loaders).toHaveLength(18);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
