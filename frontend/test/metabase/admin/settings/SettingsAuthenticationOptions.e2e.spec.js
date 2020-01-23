import "metabase/plugins/builtin";

import { useSharedAdminLogin, createTestStore } from "__support__/e2e";
import { click } from "__support__/enzyme";

import { mount } from "enzyme";

import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp";
import AuthenticationOption from "metabase/admin/settings/components/widgets/AuthenticationOption";
import SettingsSingleSignOnForm from "metabase/admin/settings/components/SettingsSingleSignOnForm";
import SettingsLdapForm from "metabase/admin/settings/components/SettingsLdapForm";

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

    expect(settingsWrapper.find(AuthenticationOption).length).toBe(2);

    // test google
    const googleConfigButton = settingsWrapper.find(".Button").first();
    click(googleConfigButton);

    expect(settingsWrapper.find(SettingsSingleSignOnForm).length).toBe(1);

    store.goBack();

    // test ldap
    const ldapConfigButton = settingsWrapper.find(".Button").at(1); // LDAP is the 2nd in the list
    click(ldapConfigButton);
    expect(settingsWrapper.find(SettingsLdapForm).length).toBe(1);
  });
});
