import { lazyLoaders } from "__support__/lazy-routes";

import { getPythonTransformsRoutes, getPythonUpsellRoutes } from "./routes";

describe("python transform routes", () => {
  it("resolves every page", async () => {
    const loaders = [
      ...lazyLoaders(getPythonTransformsRoutes()),
      ...lazyLoaders(getPythonUpsellRoutes()),
    ];

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
