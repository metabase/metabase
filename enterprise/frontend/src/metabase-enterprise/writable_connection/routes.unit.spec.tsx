import { lazyLoaders } from "__support__/lazy-routes";

import { getWritableConnectionInfoRoutes } from "./routes";

describe("writable connection routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getWritableConnectionInfoRoutes());

    expect(loaders).toHaveLength(1);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
