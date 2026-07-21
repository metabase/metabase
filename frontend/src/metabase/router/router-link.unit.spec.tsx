import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Link, Outlet, Route, useLocation } from "metabase/router";

import type { RouterEngine } from "./engine";

function Home() {
  const { pathname } = useLocation();
  return (
    <div>
      <span data-testid="location">{pathname}</span>
      <Link to="/other">go</Link>
      <Outlet />
    </div>
  );
}

const tree = (
  <Route path="/" element={<Home />}>
    <Route path="other" element={<span data-testid="other">other</span>} />
  </Route>
);

// A v3 `<Link>` reads v3's legacy router context, which the v7 engine does not
// provide, so it threw "rendered outside of a router context" on click. The
// engine-aware `RouterLink` renders v7's `<Link>` on v7, so clicking navigates on
// both engines.
describe.each<RouterEngine>(["v3", "v7"])(
  "RouterLink on the %s engine",
  (routerEngine) => {
    it("navigates on click without throwing", async () => {
      renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByRole("link", { name: "go" }));

      expect(await screen.findByTestId("other")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/other");
    });
  },
);
