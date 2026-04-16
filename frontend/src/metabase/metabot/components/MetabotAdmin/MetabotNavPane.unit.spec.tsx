import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { MetabotNavPane } from "./MetabotNavPane";

const setup = ({
  aiFeaturesEnabled = true,
  aiControlsEnabled = false,
  isConfigured = true,
}: {
  aiFeaturesEnabled?: boolean;
  aiControlsEnabled?: boolean;
  isConfigured?: boolean;
} = {}) => {
  mockSettings({
    "ai-features-enabled?": aiFeaturesEnabled,
    "token-features": createMockTokenFeatures({
      ai_controls: aiControlsEnabled,
    }),
  });

  setupEnterprisePlugins();

  return renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotNavPane} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot",
      storeInitialState: {
        settings: createMockSettingsState({
          "ai-features-enabled?": aiFeaturesEnabled,
          "llm-metabot-configured?": isConfigured,
        }),
      },
    },
  );
};

describe("MetabotNavPane", () => {
  afterEach(() => {
    reinitialize();
  });

  it("hides the ai controls items when all AI features are disabled", () => {
    setup({
      aiControlsEnabled: true,
      aiFeaturesEnabled: false,
      isConfigured: true,
    });

    expect(screen.getByText("AI Settings")).toBeInTheDocument();
    expect(screen.queryByText("Usage controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Customization")).not.toBeInTheDocument();
    expect(screen.queryByText("System prompts")).not.toBeInTheDocument();
  });

  it("displays the ai controls in a disabled state when not configured", async () => {
    setup({ aiControlsEnabled: true, isConfigured: false });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();

    expect(
      screen.getByText("Usage controls").closest('[data-disabled="true"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Customization").closest('[data-disabled="true"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText("System prompts").closest('[data-disabled="true"]'),
    ).toBeInTheDocument();
  });
});
