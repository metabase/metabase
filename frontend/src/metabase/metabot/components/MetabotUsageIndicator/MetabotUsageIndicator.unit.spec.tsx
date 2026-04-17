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
  isMetabotEnabled = true,
}: {
  usage?: MetabotUsage | null;
  isMetabotEnabled?: boolean;
} = {}) {
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions({ usage }),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": isMetabotEnabled,
  });
  setupEnterprisePlugins();

  renderWithProviders(<MetabotUsageIndicator variant="detailed" />, {
    storeInitialState: createMockState({ settings }),
  });
}

function setupCompact({
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

  renderWithProviders(<MetabotUsageIndicator variant="compact" />, {
    storeInitialState: createMockState({ settings }),
  });
}

describe("MetabotUsageIndicator", () => {
  describe("detailed variant", () => {
    it("renders nothing when no usage data", async () => {
      setup({ usage: null });
      expect(screen.queryByText(/usage/i)).not.toBeInTheDocument();
    });

    it("renders nothing when no limits configured", async () => {
      setup({
        usage: createMockMetabotUsage({
          user_limit: null,
          instance_limit: null,
        }),
      });
      expect(screen.queryByText(/usage/i)).not.toBeInTheDocument();
    });

    it("renders user usage bar when user limit is configured", async () => {
      setup({
        usage: createMockMetabotUsage({
          user_usage: 50,
          user_limit: 100,
          instance_limit: null,
        }),
      });
      expect(await screen.findByText("Your usage")).toBeInTheDocument();
      expect(
        await screen.findByText("50.0 / 100.0M tokens used"),
      ).toBeInTheDocument();
    });

    it("renders pool usage bar when instance limit is configured", async () => {
      setup({
        usage: createMockMetabotUsage({
          user_limit: null,
          instance_usage: 200,
          instance_limit: 500,
        }),
      });
      expect(await screen.findByText("Instance pool")).toBeInTheDocument();
      expect(
        await screen.findByText("200.0 / 500.0M tokens used"),
      ).toBeInTheDocument();
    });

    it("renders both bars when both limits are configured", async () => {
      setup({
        usage: createMockMetabotUsage({
          user_usage: 30,
          user_limit: 100,
          instance_usage: 200,
          instance_limit: 500,
        }),
      });
      expect(await screen.findByText("Your usage")).toBeInTheDocument();
      expect(await screen.findByText("Instance pool")).toBeInTheDocument();
    });

    it("renders tenant pool label when tenant limit is present", async () => {
      setup({
        usage: createMockMetabotUsage({
          user_limit: null,
          instance_limit: null,
          tenant_usage: 50,
          tenant_limit: 200,
        }),
      });
      expect(await screen.findByText("Organization pool")).toBeInTheDocument();
    });

    it("shows reset rate text", async () => {
      setup({
        usage: createMockMetabotUsage({
          user_usage: 10,
          user_limit: 100,
          limit_reset_rate: "weekly",
        }),
      });
      expect(await screen.findByText("Resets weekly")).toBeInTheDocument();
    });
  });

  describe("compact variant", () => {
    it("renders nothing when no limits configured", () => {
      setupCompact({
        usage: createMockMetabotUsage({
          user_limit: null,
          instance_limit: null,
        }),
      });
      expect(screen.queryByLabelText("AI usage")).not.toBeInTheDocument();
    });

    it("renders ring progress when limits are configured", async () => {
      setupCompact({
        usage: createMockMetabotUsage({
          user_usage: 50,
          user_limit: 100,
        }),
      });
      expect(await screen.findByLabelText("AI usage")).toBeInTheDocument();
    });
  });
});
