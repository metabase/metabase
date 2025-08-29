import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { useMetabotEnabled } from "./use-metabot-enabled";

const TestComponent = () => {
  const isEnabled = useMetabotEnabled();
  return <div data-testid="metabot-enabled">{String(isEnabled)}</div>;
};

const setup = ({
  metabotFeatureEnabled,
}: {
  metabotFeatureEnabled: boolean;
}) => {
  setupEnterprisePlugins();
  setupPropertiesEndpoints(
    createMockSettings({ "metabot-feature-enabled": metabotFeatureEnabled }),
  );
  renderWithProviders(<TestComponent />);
};

describe("useMetabotEnabled", () => {
  it("should return true when metabot-feature-enabled setting is true", async () => {
    setup({ metabotFeatureEnabled: true });

    expect(await screen.findByTestId("metabot-enabled")).toHaveTextContent(
      "true",
    );
  });

  it("should return false when metabot-feature-enabled setting is false", async () => {
    setup({ metabotFeatureEnabled: false });

    expect(await screen.findByTestId("metabot-enabled")).toHaveTextContent(
      "false",
    );
  });
});
