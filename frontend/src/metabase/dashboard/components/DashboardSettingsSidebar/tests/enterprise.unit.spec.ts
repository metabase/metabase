import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("DashboardSettingsSidebar > enterprise", () => {
  it("should render the component", async () => {
    await setup();

    expect(screen.getByText("Dashboard settings")).toBeInTheDocument();
    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should not render caching section without caching feature", async () => {
    await setup();

    expect(screen.queryByText("Caching")).not.toBeInTheDocument();
  });
});
