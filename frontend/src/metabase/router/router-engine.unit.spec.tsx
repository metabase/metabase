import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  Outlet,
  Route,
  navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "metabase/router";

function Layout() {
  return (
    <div>
      <span data-testid="layout">layout</span>
      <Outlet />
    </div>
  );
}

function ThingPage() {
  const { pathname, search } = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <div>
      <span data-testid="pathname">{pathname}</span>
      <span data-testid="search">{search}</span>
      <span data-testid="thing-id">{params.thingId}</span>
      <span data-testid="splat">{String(params["*"])}</span>
      <span data-testid="query-tab">{searchParams.get("tab")}</span>
      <button onClick={() => navigate("/other")}>go absolute</button>
      <button onClick={() => navigate("..")}>go up</button>
    </div>
  );
}

const tree = (
  <Route path="/" element={<Layout />}>
    <Route path="things/:thingId" element={<ThingPage />} />
    <Route path="other" element={<span data-testid="other">other page</span>} />
  </Route>
);

function setup(initialRoute: string) {
  return renderWithProviders(tree, { withRouter: true, initialRoute });
}

describe("v7 engine (facade over real react-router v7)", () => {
  it("resolves location, search, and params through the bridge", () => {
    setup("/things/42?tab=x");

    expect(screen.getByTestId("layout")).toBeInTheDocument();
    expect(screen.getByTestId("pathname")).toHaveTextContent("/things/42");
    expect(screen.getByTestId("search")).toHaveTextContent("?tab=x");
    expect(screen.getByTestId("thing-id")).toHaveTextContent("42");
  });

  it("exposes the search params through useSearchParams", () => {
    setup("/things/42?tab=x");
    expect(screen.getByTestId("query-tab")).toHaveTextContent("x");
  });

  // The tree is wrapped in a pathless layout route for the app shell. Pathless
  // means it must contribute nothing to matching, so no route below it should
  // see params it did not declare itself.
  it("the host's layout route contributes no params of its own", () => {
    setup("/things/42");
    expect(screen.getByTestId("splat")).toHaveTextContent("undefined");
  });

  // The module-level `navigate` carries no route context, so a pathname without
  // a leading slash resolves against the root. Resolving it against the deepest
  // match instead would send `{ pathname: "other" }` to `/things/other`.
  it("resolves a relative navigate() from the root", async () => {
    setup("/things/42");

    navigate({ pathname: "other" });

    expect(await screen.findByTestId("other")).toBeInTheDocument();
  });

  it("navigates to an absolute path via useNavigate", async () => {
    setup("/things/42");
    await userEvent.click(screen.getByRole("button", { name: "go absolute" }));
    expect(await screen.findByTestId("other")).toBeInTheDocument();
  });

  it("resolves relative navigation against the matched route branch", async () => {
    setup("/things/42");
    await userEvent.click(screen.getByRole("button", { name: "go up" }));
    // `..` climbs out of `things/:thingId` to the parent `/`, leaving the layout
    // with no matched child.
    expect(screen.getByTestId("layout")).toBeInTheDocument();
    expect(screen.queryByTestId("thing-id")).not.toBeInTheDocument();
  });
});
