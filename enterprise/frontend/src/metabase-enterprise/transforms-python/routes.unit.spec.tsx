import { lazyLoaders } from "__support__/lazy-routes";
import { isFeatureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import { getPythonTransformsRoutes } from "./routes";

describe("python transform routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getPythonTransformsRoutes());

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      // A gated loader resolves one page per feature state; check both.
      const branches = isFeatureGatedRoute(load)
        ? [load.enabled, load.disabled]
        : [load];
      for (const branch of branches) {
        expect((await branch()).Component).toBeDefined();
      }
    }
  });
});
