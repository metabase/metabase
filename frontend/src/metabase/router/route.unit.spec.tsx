import { useEffect } from "react";

import { act, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { Outlet, useRoute } from "./Outlet";
import { Route } from "./route";

const Parent = () => (
  <div>
    <Outlet />
  </div>
);
const IndexPage = () => <div>index-page</div>;
const ChildPage = () => <div>child-page</div>;

function ParentPage() {
  return (
    <div>
      <span>parent chrome</span>
      <Outlet />
    </div>
  );
}

function LeafPage() {
  return <span>leaf content</span>;
}

function setup(initialRoute: string) {
  return renderWithProviders(
    <Route path="parent" element={<Parent />}>
      <Route index element={<IndexPage />} />
      <Route path="child" element={<ChildPage />} />
    </Route>,
    { withRouter: true, initialRoute },
  );
}

describe("router/Route", () => {
  it("renders an `index` route at the parent's exact path", async () => {
    setup("/parent");

    expect(await screen.findByText("index-page")).toBeInTheDocument();
    expect(screen.queryByText("child-page")).not.toBeInTheDocument();
  });

  it("does not render the `index` route for a child path", async () => {
    setup("/parent/child");

    expect(await screen.findByText("child-page")).toBeInTheDocument();
    expect(screen.queryByText("index-page")).not.toBeInTheDocument();
  });

  it("renders a plain (non-index) route like v3", async () => {
    renderWithProviders(<Route path="solo" element={<ChildPage />} />, {
      withRouter: true,
      initialRoute: "/solo",
    });

    expect(await screen.findByText("child-page")).toBeInTheDocument();
  });
});

describe("router/Route element", () => {
  function setupElement(initialRoute: string) {
    return renderWithProviders(
      <Route path="/" element={<ParentPage />}>
        <Route path="leaf" element={<LeafPage />} />
      </Route>,
      { withRouter: true, initialRoute },
    );
  }

  it("renders a route `element` on v3", () => {
    setupElement("/");
    expect(screen.getByText("parent chrome")).toBeInTheDocument();
  });

  it("renders a nested `element` into the parent's <Outlet/>", () => {
    setupElement("/leaf");
    expect(screen.getByText("parent chrome")).toBeInTheDocument();
    expect(screen.getByText("leaf content")).toBeInTheDocument();
  });

  it("renders nothing in the <Outlet/> when no child matches", () => {
    setupElement("/");
    expect(screen.queryByText("leaf content")).not.toBeInTheDocument();
  });
});

function RoutePathProbe({ label }: { label: string }) {
  // The matched route is a v3 route config; read its `path` for the assertion.
  const route = useRoute() as { path?: string } | null;
  return (
    <div>
      <span>{`${label}:${route?.path ?? "none"}`}</span>
      <Outlet />
    </div>
  );
}

describe("router/useRoute", () => {
  function setupNested(initialRoute: string) {
    return renderWithProviders(
      <Route path="/" element={<RoutePathProbe label="parent" />}>
        <Route path="child" element={<RoutePathProbe label="child" />} />
      </Route>,
      { withRouter: true, initialRoute },
    );
  }

  it("exposes the matched route to an `element` route", () => {
    setupNested("/child");
    expect(screen.getByText("child:child")).toBeInTheDocument();
  });

  it("gives each route its own route, not the deepest match", () => {
    setupNested("/child");
    // The parent still sees its own route even though a deeper child matched.
    expect(screen.getByText("parent:/")).toBeInTheDocument();
  });
});

describe("router/Route element memoization", () => {
  it("reuses a shared element component across sibling routes instead of remounting it", async () => {
    let mounts = 0;
    const Shared = () => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return (
        <div>
          <span>shared-chrome</span>
          <Outlet />
        </div>
      );
    };
    const PageA = () => <div>page-a</div>;
    const PageB = () => <div>page-b</div>;

    const { history } = renderWithProviders(
      <Route path="shared">
        <Route path=":a" element={<Shared />}>
          <Route index element={<PageA />} />
        </Route>
        <Route path=":a/:b" element={<Shared />}>
          <Route index element={<PageB />} />
        </Route>
      </Route>,
      { withRouter: true, initialRoute: "/shared/1" },
    );

    expect(await screen.findByText("page-a")).toBeInTheDocument();
    expect(mounts).toBe(1);

    act(() => {
      checkNotNull(history).push("/shared/1/2");
    });

    // The sibling route renders the same `Shared` component, so it reconciles
    // across the navigation instead of remounting: `mounts` stays at 1.
    expect(await screen.findByText("page-b")).toBeInTheDocument();
    expect(mounts).toBe(1);
  });
});
