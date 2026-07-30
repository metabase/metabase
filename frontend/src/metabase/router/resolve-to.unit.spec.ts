import { getRoutePathnames, resolveTo } from "./resolve-to";
import type { PlainRoute } from "./types";

// A matched route as `RouterBridge` builds it: `pathnameBase` is the URL prefix
// v7 matched for that route (`match.pathname`). getRoutePathnames only reads it.
const route = (pathnameBase?: string) => ({ pathnameBase }) as PlainRoute;

// The pathname `".."` resolves to, from the deepest of `routes`.
const parentOf = (routes: PlainRoute[], pathname: string) =>
  resolveTo("..", getRoutePathnames(routes), pathname, false).pathname;

describe("getRoutePathnames", () => {
  it("reads each route's matched pathname, without a trailing slash", () => {
    expect(
      getRoutePathnames([
        route("/"),
        route("/collection/5"),
        route("/collection/5/"),
        route("/collection/5/archive"),
      ]),
    ).toEqual(["/", "/collection/5", "/collection/5", "/collection/5/archive"]);
  });

  it("gives a pathless route the empty base v7 reports as its parent's", () => {
    // v7 gives a pathless (layout) route its parent's `match.pathname`, so its
    // entry equals the neighbour rather than adding a step.
    expect(
      getRoutePathnames([route("/collection/5"), route("/collection/5")]),
    ).toEqual(["/collection/5", "/collection/5"]);
  });
});

describe("resolveTo", () => {
  it('climbs one route for ".."', () => {
    expect(
      parentOf(
        [route("/collection/5"), route("/collection/5/archive")],
        "/collection/5/archive",
      ),
    ).toBe("/collection/5");
  });

  it("climbs a route whose path spans several segments", () => {
    expect(
      parentOf(
        [
          route("/account/notifications"),
          route("/account/notifications/pulse/7/archive"),
        ],
        "/account/notifications/pulse/7/archive",
      ),
    ).toBe("/account/notifications");
  });

  it("climbs out of a route whose match includes a splat", () => {
    // A splat route's `match.pathname` covers the swallowed tail, so `".."`
    // reads the parent's entry and lands above the whole splat route.
    expect(
      parentOf(
        [route("/collection"), route("/collection/entity/abc/def")],
        "/collection/entity/abc/def",
      ),
    ).toBe("/collection");
  });

  it('resolves a named relative target ("child") against the deepest match', () => {
    expect(
      resolveTo(
        "sibling",
        getRoutePathnames([route("/data/5"), route("/data/5/edit")]),
        "/data/5/edit",
        false,
      ).pathname,
    ).toBe("/data/5/edit/sibling");
  });

  it("passes an absolute target through untouched", () => {
    expect(
      resolveTo(
        "/browse/databases",
        getRoutePathnames([route("/data/5")]),
        "/data/5",
        false,
      ).pathname,
    ).toBe("/browse/databases");
  });
});
