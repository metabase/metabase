import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { EnterpriseSettings, SettingDefinition } from "metabase-types/api";
import {
  createMockGroup,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { SettingsLdapForm } from "./SettingsLdapForm";

const setup = async (
  settingValues?: Partial<EnterpriseSettings>,
  {
    settingDefinitions = [],
    detailsDelayMs,
  }: { settingDefinitions?: SettingDefinition[]; detailsDelayMs?: number } = {},
) => {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ sso_ldap: true }),
    ...settingValues,
  });
  // the auth plugin reads the token features from the global settings when it registers the LDAP cards
  const settingsState = mockSettings(settings);
  setupEnterpriseOnlyPlugin("auth");
  // the page renders before the admin list lands, so the list can be made to lag
  fetchMock.get("path:/api/setting", settingDefinitions, {
    name: "settings-list",
    delay: detailsDelayMs,
  });
  // the provisioning switch reads its value back after saving, so the properties mock has to remember writes
  setupStatefulSettingsEndpoints(settings);
  fetchMock.get("path:/api/permissions/group", [createMockGroup()]);
  fetchMock.put("path:/api/ldap/settings", { status: 204 });

  renderWithProviders(<SettingsLdapForm />, {
    withUndos: true,
    storeInitialState: { settings: settingsState },
  });

  await screen.findByText("Server settings");
};

describe("SettingsLdapForm (EE)", () => {
  describe("user provisioning", () => {
    it("sits right below the server settings", async () => {
      await setup();

      const cardTitles = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(cardTitles).toEqual([
        "Server settings",
        "User provisioning",
        "User schema",
        "Attributes",
        "Group mapping",
      ]);
    });

    it("stays editable before the LDAP host is saved", async () => {
      await setup({ "ldap-host": null });

      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      await waitFor(() => expect(toggle).toBeEnabled());
    });

    it("keeps the switch disabled until the settings list says whether an env var owns it", async () => {
      await setup(
        {
          "ldap-host": "ldap.example.test",
          "ldap-user-provisioning-enabled?": true,
        },
        {
          settingDefinitions: [
            {
              key: "ldap-user-provisioning-enabled?",
              is_env_setting: true,
              env_name: "MB_LDAP_USER_PROVISIONING_ENABLED",
            },
          ],
          detailsDelayMs: 300,
        },
      );
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      expect(toggle).toBeDisabled();

      expect(
        await screen.findByText("Using MB_LDAP_USER_PROVISIONING_ENABLED"),
      ).toBeInTheDocument();
      expect(toggle).toBeDisabled();
      expect(toggle).toBeChecked();
      expect(toggle).toHaveAccessibleDescription(
        /Using MB_LDAP_USER_PROVISIONING_ENABLED/,
      );
    });

    it("saves right away without touching the page form", async () => {
      await setup({
        "ldap-enabled": true,
        "ldap-host": "ldap.example.test",
        "ldap-user-provisioning-enabled?": true,
      });
      const toggle = screen.getByRole("switch", { name: "User provisioning" });
      await waitFor(() => expect(toggle).toBeEnabled());
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);

      await waitFor(() => expect(toggle).not.toBeChecked());
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(
        /\/api\/setting\/ldap-user-provisioning-enabled%3F$/,
      );
      expect(puts[0].body).toEqual({ value: false });
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled();
    });
  });
});
