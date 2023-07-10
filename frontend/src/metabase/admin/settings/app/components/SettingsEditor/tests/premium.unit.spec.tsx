import userEvent from "@testing-library/user-event";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      disable_password_login: true,
      embedding: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditor", () => {
  describe("enable password login", () => {
    it("should allow toggling on and off password login", async () => {
      setupPremium({
        settings: [
          createMockSettingDefinition({ key: "enable-password-login" }),
          createMockSettingDefinition({ key: "google-auth-enabled" }),
        ],
        settingValues: createMockSettings({
          "enable-password-login": true,
          "google-auth-enabled": true,
        }),
      });

      userEvent.click(await screen.findByText("Authentication"));
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
      expect(
        screen.getByText("Enable Password Authentication"),
      ).toBeInTheDocument();
    });
  });

  describe("full-app embedding", () => {
    it("should allow to configure the origin for full-app embedding", async () => {
      setupPremium({
        settings: [
          createMockSettingDefinition({ key: "enable-embedding" }),
          createMockSettingDefinition({ key: "embedding-app-origin" }),
        ],
        settingValues: createMockSettings({
          "enable-embedding": true,
        }),
      });

      userEvent.click(await screen.findByText("Embedding"));
      userEvent.click(screen.getByText("Full-app embedding"));
      expect(screen.getByText("Authorized origins")).toBeInTheDocument();
      expect(
        screen.queryByText(/some of our paid plans/),
      ).not.toBeInTheDocument();
    });
  });
});
