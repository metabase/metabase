import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setupEnterprise } from "./setup";

const tokenFeatures = {
  cache_granular_controls: true,
};

describe("DashboardSettingsSidebar > premium enterprise", () => {
  it("should render the component", async () => {
    await setupEnterprise({}, tokenFeatures);

    expect(screen.getByText("Dashboard settings")).toBeInTheDocument();
    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should render caching section with caching feature", async () => {
    await setupEnterprise({}, tokenFeatures);

    expect(await screen.findByText("Caching")).toBeInTheDocument();
    expect(await screen.findByText("Caching policy")).toBeInTheDocument();
  });

  it("should show cache form when clicking on caching section", async () => {
    await setupEnterprise({}, tokenFeatures);

    await userEvent.click(await screen.findByText("Use default"));

    expect(await screen.findByText("Caching settings")).toBeInTheDocument();
  });
});
