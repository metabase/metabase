import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import type { RouterApi } from "./test-utils";
import { runBoth } from "./test-utils";

/**
 * Mounted in a child route, so `relative: "route"` resolves against the child.
 * The readouts come from the parent route, which stays mounted after the probe
 * navigates away.
 */
function RelativeNavigateProbe({ api }: { api: RouterApi }) {
  const navigate = api.useNavigate();
  return (
    <div>
      <button onClick={() => navigate("..", { relative: "route" })}>
        up-route
      </button>
      <button onClick={() => navigate("..", { relative: "path" })}>
        up-path
      </button>
      <button onClick={() => navigate("..")}>up-default</button>
      <button onClick={() => navigate("../sibling")}>sibling</button>
      <button onClick={() => navigate("..", { replace: true })}>
        up-replace
      </button>
      <button onClick={() => navigate("?x=1")}>query-only</button>
    </div>
  );
}

const click = (name: string) =>
  userEvent.click(screen.getByRole("button", { name }));

const collectionRoute = {
  initialRoute: "/collection/5/move",
  facadePath: "collection/:slug",
  v7Path: "collection/:slug",
  childPath: "move",
};

// A modal route whose path spans several URL segments, e.g. the account
// notification routes' `pulse/:pulseId/archive`.
const multiSegmentRoute = {
  initialRoute: "/account/notifications/pulse/7/archive",
  facadePath: "account/notifications",
  v7Path: "account/notifications",
  childPath: "pulse/:pulseId/archive",
};

describe("router/useNavigate relative conformance", () => {
  it('matches v7 when ".." climbs one route', async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...collectionRoute,
      interact: () => click("up-route"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/collection/5");
  });

  it('matches v7 when ".." defaults to route-relative', async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...collectionRoute,
      interact: () => click("up-default"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/collection/5");
  });

  it('matches v7 when ".." climbs a route spanning several segments', async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...multiSegmentRoute,
      interact: () => click("up-route"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/account/notifications");
  });

  it('matches v7 when ".." climbs a single segment with relative: "path"', async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...multiSegmentRoute,
      interact: () => click("up-path"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/account/notifications/pulse/7");
  });

  it("matches v7 when navigating to a sibling route", async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...collectionRoute,
      interact: () => click("sibling"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/collection/5/sibling");
  });

  it('matches v7 when ".." replaces the current entry', async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...collectionRoute,
      interact: () => click("up-replace"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/collection/5");
  });

  it("matches v7 when a destination carries only a query", async () => {
    const { facade, v7 } = await runBoth(RelativeNavigateProbe, {
      ...collectionRoute,
      interact: () => click("query-only"),
    });
    expect(facade).toEqual(v7);
    expect(facade["rr-pathname"]).toBe("/collection/5/move");
    expect(facade["rr-search"]).toBe("?x=1");
  });
});
