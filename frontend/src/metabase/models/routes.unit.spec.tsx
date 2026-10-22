import { lazyLoaders } from "__support__/lazy-routes";

import { getRoutes } from "./routes";

describe("model routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getRoutes());

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
