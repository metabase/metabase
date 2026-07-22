import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { useDispatch } from "metabase/redux";
import { Link, Outlet, Route, push, useLocation } from "metabase/router";

import type { RouterEngine } from "./engine";

function Home() {
  const { pathname } = useLocation();
  const dispatch = useDispatch();
  return (
    <div>
      <span data-testid="location">{pathname}</span>
      <Link to="/other">go</Link>
      {/* A `<Link>` used as a button: it navigates through its own onClick. */}
      <Link onClick={() => dispatch(push("/other"))}>act</Link>
      {/* A button-like `<Link to="">` (e.g. the undo toast) must not navigate. */}
      <Link to="" onClick={() => undefined}>
        noop
      </Link>
      <Link to="/" activeClassName="is-active" onlyActiveOnIndex>
        home
      </Link>
      <Link to="/other" activeClassName="is-active">
        section
      </Link>
      {/* v3 resolved a bare path against the root, not the current route. */}
      <Link to="other">bare</Link>
      <Link to="https://www.metabase.com/docs">external</Link>
      <Link to="mailto:help@metabase.com">mail</Link>
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

    // Only the destination is asserted: v3's memory history leaves the bare path
    // literal in tests, though a real browser resolves it against the root the way
    // v7 now does.
    it("resolves a bare relative path against the root", async () => {
      renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByRole("link", { name: "bare" }));

      expect(await screen.findByTestId("other")).toBeInTheDocument();
    });

    // Anchoring bare paths must not touch absolute URLs, or a docs link becomes
    // `/https:/www.metabase.com/...`.
    it("leaves absolute urls untouched", async () => {
      renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/",
      });

      expect(screen.getByRole("link", { name: "external" })).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs",
      );
      expect(screen.getByRole("link", { name: "mail" })).toHaveAttribute(
        "href",
        "mailto:help@metabase.com",
      );
    });

    it("applies activeClassName to the link that matches the route", async () => {
      renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/other",
      });

      await screen.findByTestId("other");

      // The exact-match home link is not active on /other; the section link is.
      expect(screen.getByText("home")).not.toHaveClass("is-active");
      expect(screen.getByText("section")).toHaveClass("is-active");
    });

    it("does not navigate on its own when used as a button (no `to`)", async () => {
      renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/",
      });

      // The click handler dispatches the navigation; the link itself must not
      // navigate, or on v7 it would clobber the push and never reach /other.
      await userEvent.click(screen.getByText("act"));

      expect(await screen.findByTestId("other")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/other");
    });

    it("does not navigate when a button-like `to=''` link is clicked", async () => {
      renderWithProviders(tree, {
        withRouter: true,
        routerEngine,
        initialRoute: "/other",
      });

      await screen.findByTestId("other");

      // On v7 an empty `to` resolved to "/" and navigated home, unmounting the
      // current view. It must stay put so only the onClick handler runs.
      await userEvent.click(screen.getByText("noop"));

      expect(screen.getByTestId("other")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/other");
    });
  },
);
