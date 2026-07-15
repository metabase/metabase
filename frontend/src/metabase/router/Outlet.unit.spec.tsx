import { renderWithProviders, screen } from "__support__/ui";

import { Outlet, withOutlet } from "./Outlet";

function ParentPage() {
  return (
    <div>
      <span>parent chrome</span>
      <Outlet />
    </div>
  );
}

describe("router/Outlet", () => {
  it("renders the matched child exposed by withOutlet", () => {
    const RoutedParent = withOutlet(ParentPage);

    renderWithProviders(<RoutedParent>child content</RoutedParent>);

    expect(screen.getByText("parent chrome")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("renders nothing when there is no matched child", () => {
    renderWithProviders(<Outlet />);
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });
});
