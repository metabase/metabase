import { screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { EMAIL_URL, setup } from "./setup";

describe("SettingsEditor", () => {
  describe("subscription allowed domains", () => {
    it("should not be visible", async () => {
      await setup({
        settings: [
          createMockSettingDefinition({ key: "subscription-allowed-domains" }),
          createMockSettingDefinition({ key: "email-configured?" }),
        ],
        settingValues: createMockSettings({
          "subscription-allowed-domains": "somedomain.com",
          "email-configured?": true,
        }),
        initialRoute: EMAIL_URL,
      });

      expect(
        screen.queryByText(/approved domains for notifications/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("subscription user visibility", () => {
    it("should not be visible", async () => {
      await setup({
        settings: [
          createMockSettingDefinition({ key: "user-visibility" }),
          createMockSettingDefinition({ key: "email-configured?" }),
        ],
        settingValues: createMockSettings({
          "user-visibility": "all",
          "email-configured?": true,
        }),
        initialRoute: EMAIL_URL,
      });

      expect(
        screen.queryByText(
          /suggest recipients on dashboard subscriptions and alerts/i,
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("SMTP configuration", () => {
    it("should be visible with self-hosted email", async () => {
      await setup({
        settings: [
          createMockSettingDefinition({ key: "user-visibility" }),
          createMockSettingDefinition({ key: "email-configured?" }),
          createMockSettingDefinition({ key: "is-hosted?" }),
        ],
        settingValues: createMockSettings({
          "user-visibility": "all",
          "email-configured?": true,
          "is-hosted?": false,
        }),
        initialRoute: EMAIL_URL,
      });

      expect(screen.getByTestId("smtp-connection-card")).toBeInTheDocument();
    });
  });
});
