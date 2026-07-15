import type { PlainRoute } from "./react-router";
import { getRoutePathnames, resolveTo } from "./resolve-to";

// getRoutePathnames only reads `path`; the rest of PlainRoute is irrelevant here.
const route = (path?: string) => ({ path }) as PlainRoute;

// The pathname `".."` resolves to, from the deepest of `routes`.
const parentOf = (routes: PlainRoute[], pathname: string) =>
  resolveTo("..", getRoutePathnames(routes, pathname), pathname, false)
    .pathname;

describe("getRoutePathnames", () => {
  it("gives a route with no path the pathname of its parent", () => {
    expect(
      getRoutePathnames(
        [route(), route("collection/:slug"), route(), route("archive")],
        "/collection/5/archive",
      ),
    ).toEqual(["/", "/collection/5", "/collection/5", "/collection/5/archive"]);
  });

  it("matches an absolute child path against the whole pathname", () => {
    expect(
      getRoutePathnames(
        [route("/model/:slug/detail"), route("actions"), route("new")],
        "/model/5-orders/detail/actions/new",
      )[1],
    ).toBe("/model/5-orders/detail/actions");
  });
});

describe("resolveTo", () => {
  it('climbs one route for ".."', () => {
    expect(
      parentOf(
        [route("collection/:slug"), route("archive")],
        "/collection/5/archive",
      ),
    ).toBe("/collection/5");
  });

  it("climbs a route whose path spans several segments", () => {
    expect(
      parentOf(
        [route("account/notifications"), route("pulse/:pulseId/archive")],
        "/account/notifications/pulse/7/archive",
      ),
    ).toBe("/account/notifications");
  });

  // v3 optional groups match a variable number of URL segments, so the number of
  // `/` in the pattern says nothing about how much of the URL it accounts for.
  describe("v3 optional groups", () => {
    const databaseRoutes = (child: string) => [
      route("data"),
      route("database(/:databaseId)(/schema/:schemaName)(/table/:tableId)"),
      route(child),
    ];

    it("climbs past an optional group that matched nothing", () => {
      expect(
        parentOf(
          databaseRoutes("impersonated/group/:groupId"),
          "/data/database/1/impersonated/group/2",
        ),
      ).toBe("/data/database/1");
    });

    it("climbs past optional groups that all matched", () => {
      expect(
        parentOf(
          databaseRoutes("segmented/group/:groupId"),
          "/data/database/1/schema/public/table/3/segmented/group/5",
        ),
      ).toBe("/data/database/1/schema/public/table/3");
    });

    it("climbs out of a route whose path ends in a splat", () => {
      expect(
        parentOf(
          [route("collection"), route("entity/:entity_id(**)")],
          "/collection/entity/abc/def",
        ),
      ).toBe("/collection");
    });

    it("climbs past a group route with a partially matched optional tail", () => {
      expect(
        parentOf(
          [
            route("data"),
            route(
              "group(/:groupId)(/database/:databaseId)(/schema/:schemaName)",
            ),
            route("segmented/group/:groupId"),
          ],
          "/data/group/2/database/1/segmented/group/5",
        ),
      ).toBe("/data/group/2/database/1");
    });
  });
});
