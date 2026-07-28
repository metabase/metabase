import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { MetabotNavPane } from "./MetabotNavPane";

const setup = ({
  aiFeaturesEnabled = true,
  aiControlsEnabled = false,
  auditAppEnabled = false,
  isConfigured = true,
  initialRoute = "/admin/metabot",
}: {
  aiFeaturesEnabled?: boolean;
  aiControlsEnabled?: boolean;
  auditAppEnabled?: boolean;
  isConfigured?: boolean;
  initialRoute?: string;
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
    <Route path="/admin/metabot*" element={<MetabotNavPane />} />,
    {
      withRouter: true,
      initialRoute,
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

  it("hides the ai controls items and disables MCP when all AI features are disabled", () => {
    setup({
      aiControlsEnabled: true,
      aiFeaturesEnabled: false,
      isConfigured: true,
    });

    expect(screen.getByText("AI Settings")).toBeInTheDocument();
    expect(
      screen.getByText("MCP", { selector: '[data-disabled="true"] *' }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Usage controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Customization")).not.toBeInTheDocument();
    expect(screen.queryByText("System prompts")).not.toBeInTheDocument();
  });

  it("displays the ai controls in a disabled state when not configured", async () => {
    setup({ aiControlsEnabled: true, isConfigured: false });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();
    expect(
      screen.queryByText("MCP", { selector: '[data-disabled="true"] *' }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Usage controls", {
        selector: '[data-disabled="true"] *',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Customization", {
        selector: '[data-disabled="true"] *',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("System prompts", {
        selector: '[data-disabled="true"] *',
      }),
    ).toBeInTheDocument();
  });

  it("displays the ai controls upsell links when the ai controls feature is unavailable", async () => {
    setup({ aiControlsEnabled: false, aiFeaturesEnabled: true });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();
    expect(screen.getByText("MCP")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Usage controls/ }),
    ).toHaveAttribute(
      "href",
      "/admin/metabot/usage-controls/ai-feature-access",
    );
    expect(screen.getByRole("link", { name: /Customization/ })).toHaveAttribute(
      "href",
      "/admin/metabot/customization",
    );
    expect(
      screen.getByRole("link", { name: /System prompts/ }),
    ).toHaveAttribute("href", "/admin/metabot/system-prompts/metabot-chat");

    await userEvent.click(await screen.findByText("MCP"));

    expect(
      await screen.findByRole("link", { name: "Settings" }),
    ).toHaveAttribute("href", "/admin/metabot/mcp");
    expect(
      screen.getByRole("link", { name: "Authorizations" }),
    ).toHaveAttribute("href", "/admin/metabot/mcp/authorizations");
  });

  it("shows usage auditing as a folder with MCP analytics (audit app) and an upsell Stats when ai controls is unavailable", async () => {
    setup({
      aiControlsEnabled: false,
      auditAppEnabled: true,
      aiFeaturesEnabled: true,
    });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();

    // Expand "Auditing" to reveal its children
    await userEvent.click(await screen.findByText("Auditing"));

    // MCP analytics is available with audit_app alone (no ai_controls needed)
    expect(
      await screen.findByRole("link", { name: "MCP analytics" }),
    ).toHaveAttribute("href", "/admin/metabot/usage-auditing/mcp");

    // Metabot stats stays an upsell (still links to usage-auditing); Conversations needs ai_controls
    expect(screen.getByRole("link", { name: /Usage stats/ })).toHaveAttribute(
      "href",
      "/admin/metabot/usage-auditing",
    );
    expect(screen.queryByText("Conversations")).not.toBeInTheDocument();
  });

  it("keeps MCP analytics (and the upsell Stats) available when AI features are disabled", async () => {
    // Regression guard: `ai-features-enabled?` must gate only the Metabot children, never the
    // `audit_app`-gated MCP analytics child or the upsell stub.
    setup({
      aiControlsEnabled: false,
      auditAppEnabled: true,
      aiFeaturesEnabled: false,
    });

    await userEvent.click(await screen.findByText("Auditing"));

    expect(
      await screen.findByRole("link", { name: "MCP analytics" }),
    ).toHaveAttribute("href", "/admin/metabot/usage-auditing/mcp");
    expect(screen.getByRole("link", { name: /Usage stats/ })).toHaveAttribute(
      "href",
      "/admin/metabot/usage-auditing",
    );
    expect(screen.queryByText("Conversations")).not.toBeInTheDocument();
  });

  it("shows usage auditing with Stats, Conversations and MCP analytics when ai controls is available", async () => {
    setup({
      aiControlsEnabled: true,
      auditAppEnabled: true,
      aiFeaturesEnabled: true,
    });

    await userEvent.click(await screen.findByText("Auditing"));

    expect(
      await screen.findByRole("link", { name: "Usage stats" }),
    ).toHaveAttribute("href", "/admin/metabot/usage-auditing");
    expect(screen.getByRole("link", { name: "Conversations" })).toHaveAttribute(
      "href",
      "/admin/metabot/usage-auditing/conversations",
    );
    expect(screen.getByRole("link", { name: "MCP analytics" })).toHaveAttribute(
      "href",
      "/admin/metabot/usage-auditing/mcp",
    );
  });
});
