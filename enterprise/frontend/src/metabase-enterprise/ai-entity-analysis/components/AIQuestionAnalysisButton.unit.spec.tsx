import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { AIQuestionAnalysisButton } from "./AIQuestionAnalysisButton";

const setup = ({
  metabotFeatureEnabled,
}: {
  metabotFeatureEnabled: boolean;
}) => {
  setupEnterprisePlugins();
  setupPropertiesEndpoints(
    createMockSettings({ "metabot-feature-enabled": metabotFeatureEnabled }),
  );
  renderWithProviders(<AIQuestionAnalysisButton />);
};

describe("AIQuestionAnalysisButton", () => {
  it("should render when metabot feature is enabled", async () => {
    setup({ metabotFeatureEnabled: true });

    expect(
      await screen.findByRole("button", { name: "Explain this chart" }),
    ).toBeInTheDocument();
  });

  it("should not render when metabot feature is disabled", () => {
    setup({ metabotFeatureEnabled: false });

    expect(
      screen.queryByRole("button", { name: "Explain this chart" }),
    ).not.toBeInTheDocument();
  });
});
