import { screen } from "__support__/ui";

import { setupEnterprise } from "./setup";

describe("DashboardInfoSidebar > enterprise", () => {
  it("should render the component", async () => {
    await setupEnterprise();

    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should not render caching section without caching feature", async () => {
    await setupEnterprise({}, { cache_granular_controls: false });

    expect(screen.queryByText("Caching")).not.toBeInTheDocument();
  });
});
