import { lazyLoaders } from "__support__/lazy-routes";

import { getDataStudioRoutes } from "./routes";

const Guard = () => null;
describe("data-studio routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioRoutes(Guard));

    // Includes the transform routes, which this tree nests.
    expect(loaders).toHaveLength(24);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});
