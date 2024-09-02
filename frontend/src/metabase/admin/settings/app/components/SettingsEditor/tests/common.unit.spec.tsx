import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { EMAIL_URL, FULL_APP_EMBEDDING_URL, setup } from "./setup";

describe("SettingsEditor", () => {
  describe("Static embedding", () => {
    it("should show info about static embedding", async () => {
      await setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": true }),
      });

      // Go to embedding settings page
      await userEvent.click(screen.getByText("Embedding"));

      const withinStaticEmbeddingCard = within(
        screen.getByRole("article", {
          name: "Static embedding",
        }),
      );

      expect(
        withinStaticEmbeddingCard.getByRole("heading", {
          name: "Static embedding",
        }),
      ).toBeInTheDocument();
      expect(
        withinStaticEmbeddingCard.getByText(/Use static embedding when/),
      ).toBeInTheDocument();
    });

    it("should allow access to the static embedding settings page", async () => {
      await setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": true }),
      });

      // Go to embedding settings page
      await userEvent.click(screen.getByText("Embedding"));

      // Go to static embedding settings page
      await userEvent.click(
        within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        ).getByRole("button", { name: "Manage" }),
      );

      expect(screen.getByText("Embedding secret key")).toBeInTheDocument();
    });
  });

  describe("Embedding SDK", () => {});

  describe("Interactive embedding", () => {
    it("should show info about interactive embedding", async () => {
      await setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": true }),
      });

      await userEvent.click(screen.getByText("Embedding"));
      expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
      expect(
        screen.getByText(/Embed dashboards, questions/),
      ).toBeInTheDocument();
    });

    it("should redirect users back to embedding settings page when visiting the full-app embedding page when embedding is not enabled", async () => {
      await setup({
        settings: [createMockSettingDefinition({ key: "enable-embedding" })],
        settingValues: createMockSettings({ "enable-embedding": false }),
        initialRoute: FULL_APP_EMBEDDING_URL,
      });

      expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
      expect(
        screen.getByText(/Embed dashboards, questions/),
      ).toBeInTheDocument();
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
