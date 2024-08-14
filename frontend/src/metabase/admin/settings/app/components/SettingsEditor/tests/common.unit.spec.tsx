import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { setup, FULL_APP_EMBEDDING_URL, EMAIL_URL } from "./setup";

describe("SettingsEditor", () => {
  describe("full-app embedding", () => {
    it("should show info about interactive embedding", async () => {
      await setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": true }),
      });

      await userEvent.click(screen.getByText("Embedding"));
      await userEvent.click(screen.getByText("Interactive embedding"));
      expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
      expect(
        screen.queryByText("SameSite cookie setting"),
      ).not.toBeInTheDocument();
    });

    it("should allow visiting the full-app embedding page even if embedding is not enabled", async () => {
      await setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": false }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(
        screen.getByText(/Embed dashboards, questions/),
      ).toBeInTheDocument();
      expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
    });
  });

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
