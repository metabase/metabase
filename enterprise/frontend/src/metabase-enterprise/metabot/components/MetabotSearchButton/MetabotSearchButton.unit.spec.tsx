import { KBarProvider } from "kbar";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { MetabotSearchButton } from "./MetabotSearchButton";

const setup = ({
  metabotFeatureEnabled,
}: {
  metabotFeatureEnabled: boolean;
}) => {
  setupEnterprisePlugins();
  setupPropertiesEndpoints(
    createMockSettings({ "metabot-feature-enabled": metabotFeatureEnabled }),
  );
  renderWithProviders(
    <KBarProvider actions={[]}>
      <MetabotSearchButton />
    </KBarProvider>,
  );
};

describe("MetabotSearchButton Feature Toggle", () => {
  it("should render metabot search interface when feature is enabled", async () => {
    setup({ metabotFeatureEnabled: true });

    // should show the metabot icon and search text
    expect(
      await screen.findByRole("button", { name: "Metabot" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Ask Metabot or search" }),
    ).toBeInTheDocument();
  });

  it("should render regular search button when feature is disabled", async () => {
    setup({ metabotFeatureEnabled: false });

    // should show regular search button instead
    expect(
      await screen.findByRole("button", { name: "Search" }),
    ).toBeInTheDocument();

    // should not show metabot-specific elements
    expect(
      screen.queryByRole("button", { name: "Metabot" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask Metabot or search" }),
    ).not.toBeInTheDocument();
  });
});
