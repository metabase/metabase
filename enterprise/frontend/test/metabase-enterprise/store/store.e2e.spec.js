import { createTestStore, useSharedAdminLogin } from "__support__/e2e";
import { mount } from "enzyme";

import "metabase/plugins/builtin";
import "metabase-enterprise/plugins";

describe("admin/store", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  it("should show the nav item and tab contents", async () => {
    const store = await createTestStore();
    store.pushPath("/admin/store");
    const app = mount(store.getAppContainer());

    // shows "Enterprise" in the top nav
    const navItems = await app.async.find(".NavItem");
    expect(navItems.map(n => n.text())).toContain("Enterprise");

    // displays the four feature boxes
    const headings = await app.async.find("h3");
    expect(headings.map(n => n.text())).toEqual([
      "Data sandboxes",
      "White labeling",
      "Auditing",
      "Single sign-on",
    ]);
  });
});
