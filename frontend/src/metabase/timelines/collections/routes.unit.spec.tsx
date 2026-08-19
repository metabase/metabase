import { getCollectionTimelineRoutes } from "./routes";

describe("collection timeline routes", () => {
  it("resolves every modal", async () => {
    const routes = getCollectionTimelineRoutes();

    expect(routes).toHaveLength(13);

    for (const route of routes) {
      const { lazy } = route;

      if (typeof lazy !== "function") {
        throw new Error(`${route.path} has no lazy loader`);
      }

      expect((await lazy()).Component).toBeDefined();
    }
  });
});
