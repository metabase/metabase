import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { McpServerUrlSection } from "./MCPServerUrlSection";

const SITE_URL = "https://metabase.example.com";
const MCP_URL = `${SITE_URL}/api/mcp`;

function setup({ siteUrl = SITE_URL }: { siteUrl?: string | undefined } = {}) {
  const settings = createMockSettings({ "site-url": siteUrl });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(
    <div>
      <McpServerUrlSection />
      <UndoListing />
    </div>,
    {
      storeInitialState: createMockState({
        settings: mockSettings(settings),
      }),
    },
  );
}

describe("McpServerUrlSection", () => {
  it("uses site-url to construct and display the MCP server URL", async () => {
    setup();
    expect(await screen.findByDisplayValue(MCP_URL)).toBeInTheDocument();
  });

  it("renders nothing when site-url is not set", () => {
    setup({ siteUrl: undefined });
    expect(screen.queryByDisplayValue(MCP_URL)).not.toBeInTheDocument();
  });

  it("can copy the MCP server URL to the clipboard", async () => {
    setup();
    await userEvent.click(
      await screen.findByRole("img", { name: /copy icon/i }),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(MCP_URL);
  });
});
