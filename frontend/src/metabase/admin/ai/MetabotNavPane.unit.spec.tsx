import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { MetabotNavPane } from "./MetabotNavPane";

const setup = ({
  aiFeaturesEnabled = true,
  aiControlsEnabled = false,
  auditAppEnabled = false,
  isConfigured = true,
  mcpEnabled = true,
  initialRoute = "/admin/metabot",
}: {
  aiFeaturesEnabled?: boolean;
  aiControlsEnabled?: boolean;
  auditAppEnabled?: boolean;
  isConfigured?: boolean;
  mcpEnabled?: boolean;
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
          "mcp-enabled?": mcpEnabled,
        }),
      },
    },
  );
};

function getUsageControlLinks() {
  return screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("/admin/metabot/usage-controls/"));
}

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

  it("displays the ai controls in a disabled state when neither Metabot nor MCP is on", async () => {
    setup({ aiControlsEnabled: true, isConfigured: false, mcpEnabled: false });

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

  it("keeps Usage controls open with only MCP tools access when Metabot is not configured but MCP is on", async () => {
    setup({
      aiControlsEnabled: true,
      isConfigured: false,
      mcpEnabled: true,
      initialRoute: "/admin/metabot/usage-controls/mcp-tools-access",
    });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();
    expect(
      screen.queryByText("Usage controls", {
        selector: '[data-disabled="true"] *',
      }),
    ).not.toBeInTheDocument();
    expect(getUsageControlLinks()).toEqual([
      "/admin/metabot/usage-controls/mcp-tools-access",
    ]);
    expect(
      screen.getByText("Customization", {
        selector: '[data-disabled="true"] *',
      }),
    ).toBeInTheDocument();
  });

  it("lists AI feature access, MCP tools access, and Limits under Usage controls when both features are on", async () => {
    setup({
      aiControlsEnabled: true,
      isConfigured: true,
      mcpEnabled: true,
      initialRoute: "/admin/metabot/usage-controls/ai-feature-access",
    });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "AI feature access" }),
    ).toHaveAttribute(
      "href",
      "/admin/metabot/usage-controls/ai-feature-access",
    );
    expect(
      screen.getByRole("link", { name: "MCP tools access" }),
    ).toHaveAttribute("href", "/admin/metabot/usage-controls/mcp-tools-access");
    expect(screen.getByRole("link", { name: "Limits" })).toHaveAttribute(
      "href",
      "/admin/metabot/usage-controls/ai-usage-limits",
    );
    expect(getUsageControlLinks()).toEqual([
      "/admin/metabot/usage-controls/ai-feature-access",
      "/admin/metabot/usage-controls/mcp-tools-access",
      "/admin/metabot/usage-controls/ai-usage-limits",
    ]);
    expect(screen.queryByTestId("upsell-gem")).not.toBeInTheDocument();
  });

  it("lists AI feature access and Limits only when Metabot is configured and MCP is off", async () => {
    setup({
      aiControlsEnabled: true,
      isConfigured: true,
      mcpEnabled: false,
      initialRoute: "/admin/metabot/usage-controls/ai-feature-access",
    });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();
    expect(getUsageControlLinks()).toEqual([
      "/admin/metabot/usage-controls/ai-feature-access",
      "/admin/metabot/usage-controls/ai-usage-limits",
    ]);
  });

  it("no longer exposes the Auditing folder or CLI analytics with audit_app", async () => {
    setup({ aiControlsEnabled: true, auditAppEnabled: true });

    expect(await screen.findByText("AI Settings")).toBeInTheDocument();
    expect(screen.queryByText("Auditing")).not.toBeInTheDocument();
    expect(screen.queryByText("CLI analytics")).not.toBeInTheDocument();
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

  it("keeps the MCP folder to Settings and Authorizations", async () => {
    setup({ aiControlsEnabled: true, initialRoute: "/admin/metabot/mcp" });

    const links = await screen.findAllByRole("link");
    const mcpLinks = links
      .filter((link) =>
        link.getAttribute("href")?.startsWith("/admin/metabot/mcp"),
      )
      .map((link) => link.getAttribute("href"));
    expect(mcpLinks).toEqual([
      "/admin/metabot/mcp",
      "/admin/metabot/mcp/authorizations",
    ]);
  });
});
