import userEvent from "@testing-library/user-event";

import { act, render, renderWithProviders, screen } from "__support__/ui";
import { Outlet, Route, useLocation, useNavigate } from "metabase/router";

import { Link } from "./Link";

function Home() {
  const { pathname, key } = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="location">{pathname}</span>
      <span data-testid="location-key">{key}</span>
      <Link to="/other">go</Link>
      {/* A `<Link>` used as a button: it navigates through its own onClick. */}
      <Link onClick={() => navigate("/other")}>act</Link>
      {/* A button-like `<Link to="">` (e.g. the undo toast) must not navigate. */}
      <Link to="" onClick={() => undefined}>
        noop
      </Link>
      <Link
        to="/"
        end
        className={({ isActive }) => (isActive ? "is-active" : "")}
      >
        home
      </Link>
      <Link
        to="/other"
        className={({ isActive }) => (isActive ? "is-active" : "")}
      >
        section
      </Link>
      {/* A bare path resolves against the root, not the current route. */}
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

describe("Link", () => {
  it("should render correctly", () => {
    render(<Link to="/">Home</Link>);

    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("navigates on click without throwing", async () => {
    renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/",
    });

    await userEvent.click(screen.getByRole("link", { name: "go" }));

    expect(await screen.findByTestId("other")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/other");
  });

  it("resolves a bare relative path against the root", async () => {
    renderWithProviders(tree, {
      withRouter: true,
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

  // react-router downgrades a click to a `replace` when the target equals the
  // current URL, so the entry is reused rather than stacked. The navigation is
  // still observable: the location gets a fresh key, which is what the documents
  // page keys its unsaved-changes prompt off.
  it("replaces the entry when linking to the current url, with a new location key", async () => {
    const { history } = renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/",
    });

    await userEvent.click(screen.getByRole("link", { name: "go" }));
    await screen.findByTestId("other");
    const keyBefore = screen.getByTestId("location-key").textContent;

    await userEvent.click(screen.getByRole("link", { name: "go" }));

    expect(screen.getByTestId("location-key")).not.toHaveTextContent(
      String(keyBefore),
    );

    // The second click reused the entry instead of stacking one, so a single
    // step back lands on the page we came from.
    await act(() => history?.goBack());
    expect(await screen.findByTestId("location")).toHaveTextContent("/");
  });

  it("styles the link that matches the route through the isActive callback", async () => {
    renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/other",
    });

    await screen.findByTestId("other");

    // The `end` home link is not active on /other; the section link is.
    expect(screen.getByText("home")).not.toHaveClass("is-active");
    expect(screen.getByText("section")).toHaveClass("is-active");
  });

  it("does not navigate on its own when used as a button (no `to`)", async () => {
    renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/",
    });

    // The click handler performs the navigation; the link itself must not
    // navigate, or it would clobber it and never reach /other.
    await userEvent.click(screen.getByText("act"));

    expect(await screen.findByTestId("other")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/other");
  });

  it("does not navigate when a button-like `to=''` link is clicked", async () => {
    renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/other",
    });

    await screen.findByTestId("other");

    // An empty `to` resolves to "/" and would navigate home, unmounting the
    // current view. It must stay put so only the onClick handler runs.
    await userEvent.click(screen.getByText("noop"));

    expect(screen.getByTestId("other")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/other");
  });
});
