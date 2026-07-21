import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-v7";

import { renderWithProviders, screen } from "__support__/ui";
import {
  Outlet,
  Route,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from "metabase/router";

import { V7RouterTree } from "./RouterProviderV7";

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
  const { location } = useRouter();

  return (
    <div>
      <span data-testid="pathname">{pathname}</span>
      <span data-testid="search">{search}</span>
      <span data-testid="thing-id">{params.thingId}</span>
      <span data-testid="query-tab">{String(location.query.tab)}</span>
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
  renderWithProviders(
    <MemoryRouter initialEntries={[initialRoute]}>
      <V7RouterTree>{tree}</V7RouterTree>
    </MemoryRouter>,
  );
}

describe("v7 engine (facade over real react-router v7)", () => {
  it("resolves location, search, and params through the bridge", () => {
    setup("/things/42?tab=x");

    expect(screen.getByTestId("layout")).toBeInTheDocument();
    expect(screen.getByTestId("pathname")).toHaveTextContent("/things/42");
    expect(screen.getByTestId("search")).toHaveTextContent("?tab=x");
    expect(screen.getByTestId("thing-id")).toHaveTextContent("42");
  });

  it("exposes a v3-shaped location.query", () => {
    setup("/things/42?tab=x");
    expect(screen.getByTestId("query-tab")).toHaveTextContent("x");
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
