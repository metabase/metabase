import { type PropsWithChildren, useEffect } from "react";

import { act, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";

import { Outlet } from "./Outlet";
import { Route } from "./route";

const Parent = ({ children }: PropsWithChildren) => <div>{children}</div>;
const IndexPage = () => <div>index-page</div>;
const ChildPage = () => <div>child-page</div>;

function setup(initialRoute: string) {
  return renderWithProviders(
    <Route path="parent" component={Parent}>
      <Route index component={IndexPage} />
      <Route path="child" component={ChildPage} />
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
    renderWithProviders(<Route path="solo" component={ChildPage} />, {
      withRouter: true,
      initialRoute: "/solo",
    });

    expect(await screen.findByText("child-page")).toBeInTheDocument();
  });
});

const Wrapper = () => (
  <div>
    <span>wrapper chrome</span>
    <Outlet />
  </div>
);

const Inner = () => (
  <div>
    <span>inner chrome</span>
    <Outlet />
  </div>
);

describe("router/Route element adapter", () => {
  it("renders an `element` wrapper with the matched child exposed via <Outlet/>", async () => {
    renderWithProviders(
      <Route element={<Wrapper />}>
        <Route path="/nested" component={ChildPage} />
      </Route>,
      { withRouter: true, initialRoute: "/nested" },
    );

    expect(await screen.findByText("child-page")).toBeInTheDocument();
    expect(screen.getByText("wrapper chrome")).toBeInTheDocument();
  });

  it("composes nested `element` wrappers", async () => {
    renderWithProviders(
      <Route element={<Wrapper />}>
        <Route element={<Inner />}>
          <Route path="/deep" component={ChildPage} />
        </Route>
      </Route>,
      { withRouter: true, initialRoute: "/deep" },
    );

    expect(await screen.findByText("child-page")).toBeInTheDocument();
    expect(screen.getByText("wrapper chrome")).toBeInTheDocument();
    expect(screen.getByText("inner chrome")).toBeInTheDocument();
  });

  it("still passes `component` routes straight through to v3", async () => {
    renderWithProviders(<Route path="/plain" component={ChildPage} />, {
      withRouter: true,
      initialRoute: "/plain",
    });

    expect(await screen.findByText("child-page")).toBeInTheDocument();
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
