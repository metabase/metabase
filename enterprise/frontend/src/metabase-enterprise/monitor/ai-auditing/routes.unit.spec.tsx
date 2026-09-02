import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type * as Router from "metabase/router";
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
jest.mock("./mcp-analytics/components/McpAnalyticsSectionLayout", () => {
  const { Outlet } = jest.requireActual<typeof Router>("metabase/router");
  return {
    McpAnalyticsSectionLayout: () => (
      <div>
        MCP analytics page
        <Outlet />
      </div>
    ),
  };
});
jest.mock("./cli-analytics/components/CliAnalyticsSectionLayout", () => {
  const { Outlet } = jest.requireActual<typeof Router>("metabase/router");
  return {
    CliAnalyticsSectionLayout: () => (
      <div>
        CLI analytics page
        <Outlet />
      </div>
    ),
  };
});
jest.mock("./mcp-analytics/components/McpUsagePage", () => ({
  McpUsagePage: () => <div>MCP usage page</div>,
}));
jest.mock("./mcp-analytics/components/McpEventsPage", () => ({
  McpEventsPage: () => <div>MCP tool calls page</div>,
}));
jest.mock("./cli-analytics/components/CliUsagePage", () => ({
  CliUsagePage: () => <div>CLI usage page</div>,
}));
jest.mock("./cli-analytics/components/CliCallsPage", () => ({
  CliCallsPage: () => <div>CLI calls page</div>,
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
      const { router } = setup({
        route: `${Urls.monitorAiAuditing()}?date=past7days~`,
        upsell,
      });

      await waitFor(() => {
        expect(router?.location).toMatchObject({
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
  ])("blocks %s when AI features are disabled", async (route, pageText) => {
    setup({ route, aiFeaturesEnabled: false });

    expect(
      await screen.findByText("AI features are disabled"),
    ).toBeInTheDocument();
    expect(screen.queryByText(pageText)).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "prioritizes globally disabled AI on the MCP route when upsell is %s",
    async (upsell) => {
      setup({
        route: "/monitor/ai-auditing/mcp",
        upsell,
        aiFeaturesEnabled: false,
        mcpEnabled: false,
      });

      expect(
        await screen.findByText("AI features are disabled"),
      ).toBeInTheDocument();
      expect(screen.queryByText("MCP analytics page")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Go to AI Settings" }),
      ).toHaveAttribute("href", Urls.adminAiSettings());
    },
  );

  it("renders Usage stats at the canonical route", async () => {
    setup({ route: Urls.monitorAiAuditingUsage() });

    expect(await screen.findByText("Usage stats page")).toBeInTheDocument();
  });

  it("renders full Metabot analytics when enabled and configured", async () => {
    setup({ route: "/monitor/ai-auditing/conversations" });

    expect(await screen.findByText("Conversations page")).toBeInTheDocument();
  });

  it("blocks MCP analytics when MCP is disabled", async () => {
    setup({ route: "/monitor/ai-auditing/mcp", mcpEnabled: false });

    expect(await screen.findByText("MCP is disabled")).toBeInTheDocument();
    expect(screen.queryByText("MCP analytics page")).not.toBeInTheDocument();
  });

  it("keeps the license upsell ahead of AI configuration", async () => {
    setup({
      route: Urls.monitorAiAuditingUsage(),
      upsell: true,
      aiFeaturesEnabled: false,
      isConfigured: false,
    });

    expect(await screen.findByText("Usage stats upsell")).toBeInTheDocument();
    expect(
      screen.queryByText("AI features are disabled"),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "renders CLI analytics unconditionally when upsell is %s",
    async (upsell) => {
      setup({
        route: Urls.monitorAiAuditingCli(),
        upsell,
        aiFeaturesEnabled: false,
        isConfigured: false,
        mcpEnabled: false,
      });

      expect(await screen.findByText("CLI analytics page")).toBeInTheDocument();
    },
  );

  describe.each([false, true])(
    "MCP and CLI sub-routes (upsell %s)",
    (upsell) => {
      it.each([
        [Urls.monitorAiAuditingMcpUsage(), "MCP usage page"],
        [Urls.monitorAiAuditingMcpEvents(), "MCP tool calls page"],
        [Urls.monitorAiAuditingCliUsage(), "CLI usage page"],
        [Urls.monitorAiAuditingCliCalls(), "CLI calls page"],
      ])("renders %s", async (route, pageText) => {
        setup({ route, upsell });

        expect(await screen.findByText(pageText)).toBeInTheDocument();
      });

      it.each([
        [Urls.monitorAiAuditingMcp(), Urls.monitorAiAuditingMcpUsage()],
        [Urls.monitorAiAuditingCli(), Urls.monitorAiAuditingCliUsage()],
      ])(
        "redirects %s to its usage sub-route, preserving the query",
        async (route, target) => {
          const { router } = setup({
            route: `${route}?date=past7days~`,
            upsell,
          });

          await waitFor(() => {
            expect(router?.location).toMatchObject({
              pathname: target,
              search: "?date=past7days~",
            });
          });
        },
      );
    },
  );

  it("applies MCP availability to the upsell route set", async () => {
    setup({
      route: "/monitor/ai-auditing/mcp",
      upsell: true,
      mcpEnabled: false,
    });

    expect(await screen.findByText("MCP is disabled")).toBeInTheDocument();
    expect(screen.queryByText("MCP analytics page")).not.toBeInTheDocument();
  });
});
