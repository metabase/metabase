import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";
import { click } from "__support__/enzyme_utils";

import { mount } from "enzyme";

import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp";
import SettingsAuthenticationOptions from "metabase/admin/settings/components/SettingsAuthenticationOptions";
import SettingsSingleSignOnForm from "metabase/admin/settings/components/SettingsSingleSignOnForm.jsx";
import SettingsLdapForm from "metabase/admin/settings/components/SettingsLdapForm.jsx";

import { INITIALIZE_SETTINGS } from "metabase/admin/settings/settings";

describe("Admin Auth Options", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  it("it should render the proper configuration form", async () => {
    const store = await createTestStore();

    store.pushPath("/admin/settings");

    const app = mount(store.getAppContainer());
    await store.waitForActions([INITIALIZE_SETTINGS]);
    const settingsWrapper = app.find(SettingsEditorApp);
    const authListItem = settingsWrapper.find(
      'span[children="Authentication"]',
    );

    click(authListItem);

    expect(settingsWrapper.find(SettingsAuthenticationOptions).length).toBe(1);

    // test google
    const googleConfigButton = settingsWrapper.find(".Button").first();
    click(googleConfigButton);

    expect(settingsWrapper.find(SettingsSingleSignOnForm).length).toBe(1);

    store.goBack();

    // test ldap
    const ldapConfigButton = settingsWrapper.find(".Button").last();
    click(ldapConfigButton);
    expect(settingsWrapper.find(SettingsLdapForm).length).toBe(1);
  });
});
