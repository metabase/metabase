import { t } from "ttag";
import { createTestStore, useSharedAdminLogin } from "__support__/e2e";
import { mount } from "enzyme";

import { delay } from "metabase/lib/promise";

import getAuditRoutes from "metabase-enterprise/audit_app/routes";
import { PLUGIN_ADMIN_NAV_ITEMS, PLUGIN_ADMIN_ROUTES } from "metabase/plugins";

describe("admin/audit", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
    // Ideally, we would mock the setting and then load metabase enterprise.
    // However, here we directly alter the plugin instead. metabase-enterprise
    // was probably already loaded, so altering the setting won't have an effect.
    PLUGIN_ADMIN_NAV_ITEMS.push({ name: t`Audit`, path: "/admin/audit" });
    PLUGIN_ADMIN_ROUTES.push(getAuditRoutes);
  });

  afterAll(() => {
    // reset the plugins
    PLUGIN_ADMIN_NAV_ITEMS.pop();
    PLUGIN_ADMIN_ROUTES.pop();
  });

  it("should show the nav item and tab contents", async () => {
    const store = await createTestStore();
    store.pushPath("/admin/audit");
    const app = mount(store.getAppContainer());

    await delay(100);

    // shows "Enterprise" in the top nav
    expect(app.find(".NavItem").map(n => n.text())).toContain("Audit");

    // displays the three expected tabs
    expect(app.find(".Form-radio").map(n => n.parent().text())).toEqual([
      "Overview",
      "All members",
      "Audit log",
    ]);
  });
});
