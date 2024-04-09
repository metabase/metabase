import "metabase/plugins/builtin";
import { setupGroupsEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import {
  createMockGroup,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  setupGroupsEndpoint([createMockGroup()]);
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      sso_ldap: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditorApp", () => {
  it("lets users access advanced LDAP settings", async () => {
    setupPremium({
      initialRoute: "/admin/settings/authentication/ldap",
      settings: [
        createMockSettingDefinition({ key: "ldap-group-membership-filter" }),
      ],
    });

    expect(await screen.findByText("Server Settings")).toBeInTheDocument();
    expect(
      await screen.findByText("Group membership filter"),
    ).toBeInTheDocument();
  });

  it("shows the admin sso notification setting", async () => {
    setupPremium({
      initialRoute: "/admin/settings/authentication",
      settingValues: createMockSettings({ "ldap-enabled": true }),
    });

    expect(
      await screen.findByText("Notify admins of new SSO users"),
    ).toBeInTheDocument();
  });
});
