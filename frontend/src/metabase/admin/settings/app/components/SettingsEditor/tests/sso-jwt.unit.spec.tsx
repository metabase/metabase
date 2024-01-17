import { screen } from "__support__/ui";
import {
  createMockGroup,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { setupGroupsEndpoint } from "__support__/server-mocks";
import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setupGroupsEndpoint([createMockGroup()]);
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      sso_jwt: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditorApp", () => {
  it("shows JWT auth option", async () => {
    setupPremium({ initialRoute: "/admin/settings/authentication" });

    expect(await screen.findByText("JWT")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Allows users to login via a JWT Identity Provider.",
      ),
    ).toBeInTheDocument();
  });

  it("lets users access JWT settings", async () => {
    setupPremium({
      initialRoute: "/admin/settings/authentication/jwt",
    });

    expect(await screen.findByText("Server Settings")).toBeInTheDocument();
    expect(
      await screen.findByText(/JWT Identity Provider URI/),
    ).toBeInTheDocument();
  });

  it("shows the admin sso notification setting", async () => {
    setupPremium({
      initialRoute: "/admin/settings/authentication",
      settingValues: createMockSettings({ "jwt-enabled": true }),
    });

    expect(
      await screen.findByText("Notify admins of new SSO users"),
    ).toBeInTheDocument();
  });
});
