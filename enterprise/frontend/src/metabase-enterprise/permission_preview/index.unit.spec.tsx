import { mockSettings } from "__support__/settings";
import { PLUGIN_ADMIN_PERMISSIONS_TABS, reinitialize } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { initializePlugin } from "./index";

function setup({ hasFeature }: { hasFeature: boolean }) {
  mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: hasFeature,
    }),
  });
  initializePlugin();
}

describe("permission preview plugin", () => {
  afterEach(() => {
    reinitialize();
  });

  it("adds the Preview access tab and its route with advanced permissions", () => {
    setup({ hasFeature: true });

    expect(PLUGIN_ADMIN_PERMISSIONS_TABS.tabs).toEqual([
      { name: "Preview access", value: "preview-access" },
    ]);
    expect(PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes()).not.toBeNull();
  });

  it("adds nothing without advanced permissions", () => {
    setup({ hasFeature: false });

    expect(PLUGIN_ADMIN_PERMISSIONS_TABS.tabs).toEqual([]);
    expect(PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes()).toBeNull();
  });
});
