import type { ReactElement } from "react";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  McpAnalyticsAvailabilityLayout,
  MetabotAnalyticsAvailabilityLayout,
} from "./AvailabilityLayouts";

type SetupOpts = {
  aiFeaturesEnabled?: boolean;
  isConfigured?: boolean;
  mcpEnabled?: boolean;
};

function setup(
  element: ReactElement,
  {
    aiFeaturesEnabled = true,
    isConfigured = true,
    mcpEnabled = true,
  }: SetupOpts = {},
) {
  renderWithProviders(
    <Route path="/monitor/ai-auditing" element={element}>
      <Route path="*" element={<div>Analytics content</div>} />
    </Route>,
    {
      initialRoute: "/monitor/ai-auditing/test",
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

describe("MetabotAnalyticsAvailabilityLayout", () => {
  it("links to AI Settings when AI features are disabled", () => {
    setup(<MetabotAnalyticsAvailabilityLayout />, {
      aiFeaturesEnabled: false,
    });

    expect(screen.getByText("AI features are disabled")).toBeInTheDocument();
    expect(screen.queryByText("Analytics content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to AI Settings" }),
    ).toHaveAttribute("href", Urls.adminAiSettings());
  });

  it("links to AI Settings when no AI provider is configured", () => {
    setup(<MetabotAnalyticsAvailabilityLayout />, { isConfigured: false });

    expect(screen.getByText("Set up AI to view analytics")).toBeInTheDocument();
    expect(screen.queryByText("Analytics content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to AI Settings" }),
    ).toHaveAttribute("href", Urls.adminAiSettings());
  });

  it("renders the child route when AI is enabled and configured", () => {
    setup(<MetabotAnalyticsAvailabilityLayout />);

    expect(screen.getByText("Analytics content")).toBeInTheDocument();
  });
});

describe("McpAnalyticsAvailabilityLayout", () => {
  it("links to AI Settings when AI features are disabled", () => {
    setup(<McpAnalyticsAvailabilityLayout />, {
      aiFeaturesEnabled: false,
      mcpEnabled: false,
    });

    expect(screen.getByText("AI features are disabled")).toBeInTheDocument();
    expect(screen.queryByText("Analytics content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to AI Settings" }),
    ).toHaveAttribute("href", Urls.adminAiSettings());
  });

  it("links to MCP settings when MCP is disabled", () => {
    setup(<McpAnalyticsAvailabilityLayout />, { mcpEnabled: false });

    expect(screen.getByText("MCP is disabled")).toBeInTheDocument();
    expect(screen.queryByText("Analytics content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to MCP settings" }),
    ).toHaveAttribute("href", Urls.adminMcpSettings());
  });

  it("renders the child route when MCP is enabled", () => {
    setup(<McpAnalyticsAvailabilityLayout />);

    expect(screen.getByText("Analytics content")).toBeInTheDocument();
  });
});
