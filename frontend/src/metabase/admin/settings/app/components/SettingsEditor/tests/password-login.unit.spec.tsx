import "metabase/plugins/builtin";
import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPasswordLogin = async (opts?: SetupOpts) => {
  await setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      disable_password_login: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditor", () => {
  it("should allow to toggle off password login", async () => {
    await setupPasswordLogin({
      settings: [
        createMockSettingDefinition({ key: "enable-password-login" }),
        createMockSettingDefinition({ key: "google-auth-enabled" }),
      ],
      settingValues: createMockSettings({
        "enable-password-login": true,
        "google-auth-enabled": true,
      }),
    });

    await userEvent.click(screen.getByText("Authentication"));
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    expect(
      screen.getByText("Enable Password Authentication"),
    ).toBeInTheDocument();
  });
});
