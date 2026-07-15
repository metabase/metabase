import type { PropsWithChildren } from "react";

import { renderWithProviders, screen } from "__support__/ui";

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
