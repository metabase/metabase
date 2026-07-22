import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import { getAiAuditingRoutes, getAiAuditingUpsellRoutes } from "./routes";

jest.mock("./metabot-analytics/components/ConversationStatsPage", () => ({
  ConversationStatsPage: () => <div>Usage stats page</div>,
}));
jest.mock("./metabot-analytics/components/ConversationsPage", () => ({
  ConversationsPage: () => <div>Conversations page</div>,
}));
jest.mock("./metabot-analytics/components/ConversationDetailPage", () => ({
  ConversationDetailPage: () => <div>Conversation detail page</div>,
}));
jest.mock(
  "./metabot-analytics/components/MetabotAnalyticsUpsellPage/MetabotAnalyticsUpsellPage",
  () => ({
    MetabotAnalyticsUpsellPage: () => <div>Usage stats upsell</div>,
  }),
);
jest.mock("./mcp-analytics/components/McpAnalyticsPage", () => ({
  McpAnalyticsPage: () => <div>MCP analytics page</div>,
}));

type SetupOpts = {
  route: string;
  upsell?: boolean;
  aiFeaturesEnabled?: boolean;
  isConfigured?: boolean;
  mcpEnabled?: boolean;
};

function setup({
  route,
  upsell = false,
  aiFeaturesEnabled = true,
  isConfigured = true,
  mcpEnabled = true,
}: SetupOpts) {
  return renderWithProviders(
    <Route path="/monitor/ai-auditing">
      {upsell ? getAiAuditingUpsellRoutes() : getAiAuditingRoutes()}
    </Route>,
    {
      initialRoute: route,
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({
          "ai-features-enabled?": aiFeaturesEnabled,
          "llm-metabot-configured?": isConfigured,
          "mcp-enabled?": mcpEnabled,
        }),
      }),
    },
  );
}

describe("AI Auditing routes", () => {
  it.each([false, true])(
    "redirects the section root to Usage stats and preserves the query when upsell is %s",
    async (upsell) => {
      const { history } = setup({
        route: `${Urls.monitorAiAuditing()}?date=past7days~`,
        upsell,
      });

      await waitFor(() => {
        expect(history?.getCurrentLocation()).toMatchObject({
          pathname: Urls.monitorAiAuditingUsage(),
          search: "?date=past7days~",
        });
      });
    },
  );

  it.each([
    [Urls.monitorAiAuditingUsage(), "Usage stats page"],
    ["/monitor/ai-auditing/conversations", "Conversations page"],
    ["/monitor/ai-auditing/conversations/42", "Conversation detail page"],
  ])("blocks %s when AI features are disabled", (route, pageText) => {
    setup({ route, aiFeaturesEnabled: false });

    expect(screen.getByText("AI features are disabled")).toBeInTheDocument();
    expect(screen.queryByText(pageText)).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "prioritizes globally disabled AI on the MCP route when upsell is %s",
    (upsell) => {
      setup({
        route: "/monitor/ai-auditing/mcp",
        upsell,
        aiFeaturesEnabled: false,
        mcpEnabled: false,
      });

      expect(screen.getByText("AI features are disabled")).toBeInTheDocument();
      expect(screen.queryByText("MCP analytics page")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Go to AI Settings" }),
      ).toHaveAttribute("href", Urls.adminAiSettings());
    },
  );

  it("renders Usage stats at the canonical route", () => {
    setup({ route: Urls.monitorAiAuditingUsage() });

    expect(screen.getByText("Usage stats page")).toBeInTheDocument();
  });

  it("renders full Metabot analytics when enabled and configured", () => {
    setup({ route: "/monitor/ai-auditing/conversations" });

    expect(screen.getByText("Conversations page")).toBeInTheDocument();
  });

  it("blocks MCP analytics when MCP is disabled", () => {
    setup({ route: "/monitor/ai-auditing/mcp", mcpEnabled: false });

    expect(screen.getByText("MCP is disabled")).toBeInTheDocument();
    expect(screen.queryByText("MCP analytics page")).not.toBeInTheDocument();
  });

  it("keeps the license upsell ahead of AI configuration", () => {
    setup({
      route: Urls.monitorAiAuditingUsage(),
      upsell: true,
      aiFeaturesEnabled: false,
      isConfigured: false,
    });

    expect(screen.getByText("Usage stats upsell")).toBeInTheDocument();
    expect(
      screen.queryByText("AI features are disabled"),
    ).not.toBeInTheDocument();
  });

  it("applies MCP availability to the upsell route set", () => {
    setup({
      route: "/monitor/ai-auditing/mcp",
      upsell: true,
      mcpEnabled: false,
    });

    expect(screen.getByText("MCP is disabled")).toBeInTheDocument();
    expect(screen.queryByText("MCP analytics page")).not.toBeInTheDocument();
  });
});
