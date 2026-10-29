import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import {
  RequireMcpEnabled,
  RequireMetabotConfigured,
} from "./RequireMetabotConfigured";

const SUB_PAGE_PATH = "/admin/metabot/1/usage-controls/ai-usage-limits";
const INDEX_PATH = "/admin/metabot/";

function setup({
  gate: Gate = RequireMetabotConfigured,
  configured = true,
  mcpEnabled = true,
}: {
  gate?: typeof RequireMetabotConfigured;
  configured?: boolean;
  mcpEnabled?: boolean;
}) {
  return renderWithProviders(
    <>
      <Route element={<Gate />}>
        <Route path={SUB_PAGE_PATH} element={<div>SUB PAGE CONTENT</div>} />
      </Route>
      <Route path={INDEX_PATH} element={<div>METABOT INDEX</div>} />
    </>,
    {
      withRouter: true,
      initialRoute: SUB_PAGE_PATH,
      storeInitialState: {
        settings: createMockSettingsState({
          "llm-metabot-configured?": configured,
          "mcp-enabled?": mcpEnabled,
        }),
      },
    },
  );
}

describe("RequireMetabotConfigured", () => {
  it("redirects to the AI settings index when AI is not configured", async () => {
    const { router } = setup({ configured: false });

    expect(await screen.findByText("METABOT INDEX")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(INDEX_PATH);
  });

  it("renders the requested sub-page when AI is configured", async () => {
    const { router } = setup({ configured: true, mcpEnabled: false });

    expect(await screen.findByText("SUB PAGE CONTENT")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(SUB_PAGE_PATH);
  });
});

describe("RequireMcpEnabled", () => {
  it("redirects to the AI settings index when the MCP server is off", async () => {
    const { router } = setup({
      gate: RequireMcpEnabled,
      configured: true,
      mcpEnabled: false,
    });

    expect(await screen.findByText("METABOT INDEX")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(INDEX_PATH);
  });

  it("renders the sub-page with only the MCP server on", async () => {
    const { router } = setup({
      gate: RequireMcpEnabled,
      configured: false,
      mcpEnabled: true,
    });

    expect(await screen.findByText("SUB PAGE CONTENT")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(SUB_PAGE_PATH);
  });
});
