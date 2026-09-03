import { lazyLoaders } from "__support__/lazy-routes";

import { getRoutes as getExplorationsRoutes } from "./routes";

describe("explorations routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getExplorationsRoutes());

    expect(loaders).toHaveLength(6);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
