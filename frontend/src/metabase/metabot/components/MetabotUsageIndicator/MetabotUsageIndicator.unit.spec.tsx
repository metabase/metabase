import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { MetabotUsage } from "metabase-types/api";
import {
  createMockMetabotUsage,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { MetabotUsageIndicator } from "./MetabotUsageIndicator";

function setup({
  usage = null,
}: {
  usage?: MetabotUsage | null;
} = {}) {
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions({ usage }),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": true,
  });
  setupEnterprisePlugins();

  renderWithProviders(<MetabotUsageIndicator />, {
    storeInitialState: createMockState({ settings }),
  });
}

describe("MetabotUsageIndicator", () => {
  it("renders nothing when no limits configured", () => {
    setup({
      usage: createMockMetabotUsage({
        user_limit: null,
        instance_limit: null,
      }),
    });
    expect(screen.queryByLabelText("AI usage")).not.toBeInTheDocument();
  });

  it("renders nothing when no usage data", () => {
    setup({ usage: null });
    expect(screen.queryByLabelText("AI usage")).not.toBeInTheDocument();
  });

  it("renders ring progress when user limit is configured", async () => {
    setup({
      usage: createMockMetabotUsage({
        user_usage: 50,
        user_limit: 100,
      }),
    });
    expect(await screen.findByLabelText("AI usage")).toBeInTheDocument();
  });

  it("renders ring progress when instance limit is configured", async () => {
    setup({
      usage: createMockMetabotUsage({
        user_limit: null,
        instance_usage: 200,
        instance_limit: 500,
      }),
    });
    expect(await screen.findByLabelText("AI usage")).toBeInTheDocument();
  });

  it("shows tooltip with usage text", async () => {
    setup({
      usage: createMockMetabotUsage({
        user_usage: 50,
        user_limit: 100,
        instance_limit: null,
      }),
    });
    expect(await screen.findByLabelText("AI usage")).toBeInTheDocument();
  });
});
