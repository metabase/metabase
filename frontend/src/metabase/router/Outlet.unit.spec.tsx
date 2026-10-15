import { renderWithProviders, screen } from "__support__/ui";
import { Outlet } from "metabase/router";

describe("router/Outlet", () => {
  it("renders nothing when there is no matched child", () => {
    renderWithProviders(<Outlet />);
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });
});
