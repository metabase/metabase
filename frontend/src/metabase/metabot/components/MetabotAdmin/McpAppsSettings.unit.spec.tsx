import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { McpAppsSettings } from "./McpAppsSettings";

const setup = async ({
  commonOrigins = [],
  customOrigins = "",
}: {
  commonOrigins?: string[];
  customOrigins?: string;
} = {}) => {
  const settings = createMockSettings({
    "mcp-apps-cors-enabled-clients": commonOrigins,
    "custom-mcp-apps-cors-origins": customOrigins,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<McpAppsSettings />, {
    storeInitialState: createMockState({
      settings: mockSettings(settings),
    }),
  });

  await screen.findByText("Supported MCP clients");
};

describe("McpAppsSettings", () => {
  it("should show all MCP client toggles", async () => {
    await setup();

    expect(await screen.findByText("Claude")).toBeInTheDocument();
    expect(await screen.findByText("Cursor and VS Code")).toBeInTheDocument();
    expect(await screen.findByText("ChatGPT")).toBeInTheDocument();
  });

  it("can toggle an MCP client on", async () => {
    await setup();

    const claudeSwitch = await screen.findByTestId("mcp-client-claude");
    await userEvent.click(claudeSwitch);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ url, body }] = puts;
    expect(url).toContain("/setting/mcp-apps-cors-enabled-clients");
    expect(body).toEqual({ value: ["claude"] });
  });

  it("can update custom origins on blur", async () => {
    await setup();

    const input = await screen.findByPlaceholderText("https://*.example.com");
    await userEvent.type(input, "https://my-app.example.com");
    await userEvent.tab();

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ url, body }] = puts;
    expect(url).toContain("/setting/custom-mcp-apps-cors-origins");
    expect(body).toEqual({ value: "https://my-app.example.com" });
  });
});
