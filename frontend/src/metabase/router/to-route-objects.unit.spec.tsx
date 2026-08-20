import { renderRoutes, screen } from "__support__/ui";
import { Outlet, Route } from "metabase/router";

import { toRouteObjects } from "./to-route-objects";

const Parent = () => (
  <div>
    <span>parent chrome</span>
    <Outlet />
  </div>
);

describe("router/toRouteObjects", () => {
  it("converts a `<Route>` subtree into route objects", () => {
    expect(
      toRouteObjects(
        <Route path="parent" element={<Parent />}>
          <Route path="child" element={<div />} />
        </Route>,
      ),
    ).toMatchObject([{ path: "parent", children: [{ path: "child" }] }]);
  });

  it("leaves the route ids to the router, so converted subtrees can be siblings", async () => {
    const routes = [
      {
        path: "/",
        element: <Parent />,
        children: [
          ...toRouteObjects(<Route path="one" element={<div>page one</div>} />),
          ...toRouteObjects(<Route path="two" element={<div>page two</div>} />),
        ],
      },
    ];

    // Both subtrees start numbering at "0", so keeping the ids they were given
    // fails the router's global uniqueness check before anything renders.
    renderRoutes(routes, { initialRoute: "/two" });

    expect(await screen.findByText("page two")).toBeInTheDocument();
    expect(screen.getByText("parent chrome")).toBeInTheDocument();
  });
});
