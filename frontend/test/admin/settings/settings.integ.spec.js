// Converted from an old Selenium E2E test
import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";
import { mount } from "enzyme";
import SettingInput from "metabase/admin/settings/components/widgets/SettingInput";
import {
  INITIALIZE_SETTINGS,
  UPDATE_SETTING,
} from "metabase/admin/settings/settings";
import { LOAD_CURRENT_USER } from "metabase/redux/user";
import { setInputValue } from "__support__/enzyme_utils";

describe("admin/settings", () => {
  beforeAll(async () => useSharedAdminLogin());

  // TODO Atte Keinänen 6/22/17: Disabled because we already have converted this to Jest&Enzyme in other branch
  describe("admin settings", () => {
    // pick a random site name to try updating it to
    const siteName = "Metabase" + Math.random();

    it("should save the setting", async () => {
      const store = await createTestStore();

      store.pushPath("/admin/settings/general");
      const app = mount(store.getAppContainer());

      await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS]);

      // first just make sure the site name isn't already set (it shouldn't since we're using a random name)
      const input = app
        .find(SettingInput)
        .first()
        .find("input");
      expect(input.prop("value")).not.toBe(siteName);

      // clear the site name input, send the keys corresponding to the site name, then blur to trigger the update
      setInputValue(input, siteName);

      await store.waitForActions([UPDATE_SETTING]);
    });

    it("should show the updated name after page reload", async () => {
      const store = await createTestStore();

      store.pushPath("/admin/settings/general");
      const app = mount(store.getAppContainer());

      await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS]);

      const input = app
        .find(SettingInput)
        .first()
        .find("input");
      expect(input.prop("value")).toBe(siteName);
    });
  });
});
