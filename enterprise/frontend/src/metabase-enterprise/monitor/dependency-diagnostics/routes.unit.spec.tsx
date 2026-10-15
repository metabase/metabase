import { lazyLoaders } from "__support__/lazy-routes";

import { getDependencyDiagnosticsRoutes } from "./routes";

describe("dependency diagnostics routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDependencyDiagnosticsRoutes());

    expect(loaders).toHaveLength(2);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
