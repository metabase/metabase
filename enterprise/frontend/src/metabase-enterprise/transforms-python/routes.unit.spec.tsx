import { lazyLoaders } from "__support__/lazy-routes";

import { getPythonTransformsRoutes } from "./routes";

describe("python transform routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getPythonTransformsRoutes());

    // Three gated routes, each carrying its on and off page.
    expect(loaders).toHaveLength(6);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
