import { lazyLoaders } from "__support__/lazy-routes";

import { getDataStudioTableRoutes } from "./routes";

const Guard = () => null;

describe("data studio table routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioTableRoutes(Guard));

    expect(loaders).toHaveLength(11);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
