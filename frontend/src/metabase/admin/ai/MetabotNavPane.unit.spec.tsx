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
  auditAppEnabled = false,
  isConfigured = true,
}: {
  aiFeaturesEnabled?: boolean;
  aiControlsEnabled?: boolean;
  auditAppEnabled?: boolean;
  isConfigured?: boolean;
} = {}) => {
  mockSettings({
    "ai-features-enabled?": aiFeaturesEnabled,
    "token-features": createMockTokenFeatures({
      ai_controls: aiControlsEnabled,
      audit_app: auditAppEnabled,
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

  it("displays the ai controls upsell links when the ai controls feature is unavailable", async () => {
    setup({ aiControlsEnabled: false, aiFeaturesEnabled: true });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Usage controls/ }),
    ).toHaveAttribute(
      "href",
      "/admin/metabot/1/usage-controls/ai-feature-access",
    );
    expect(screen.getByRole("link", { name: /Customization/ })).toHaveAttribute(
      "href",
      "/admin/metabot/1/customization",
    );
    expect(
      screen.getByRole("link", { name: /System prompts/ }),
    ).toHaveAttribute("href", "/admin/metabot/1/system-prompts/metabot-chat");
  });

  it("displays the usage auditing upsell link when audit app is available and ai controls is unavailable", async () => {
    setup({
      aiControlsEnabled: false,
      auditAppEnabled: true,
      aiFeaturesEnabled: true,
    });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Usage auditing/ }),
    ).toHaveAttribute("href", "/admin/metabot/usage-auditing");
  });
});
