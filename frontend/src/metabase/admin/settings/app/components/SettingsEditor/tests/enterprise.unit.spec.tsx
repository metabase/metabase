import userEvent from "@testing-library/user-event";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  setup({ ...opts, hasEnterprisePlugins: true });
};

describe("SettingsEditor", () => {
  it("should not allow to configure the origin for full-app embedding", async () => {
    setupEnterprise({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
      ],
      settingValues: createMockSettings({ "enable-embedding": true }),
    });

    userEvent.click(await screen.findByText("Embedding"));
    userEvent.click(screen.getByText("Full-app embedding"));
    expect(screen.getByText(/some of our paid plans/)).toBeInTheDocument();
    expect(screen.queryByText("Authorized origins")).not.toBeInTheDocument();
  });

  it("should not allow to toggle off password login", async () => {
    setupEnterprise({
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
      screen.queryByText("Enable Password Authentication"),
    ).not.toBeInTheDocument();
  });
});
