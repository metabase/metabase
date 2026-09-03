import { lazyLoaders } from "__support__/lazy-routes";

import { getDataStudioSnippetRoutes } from "./routes";

describe("data studio snippet routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioSnippetRoutes());

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
