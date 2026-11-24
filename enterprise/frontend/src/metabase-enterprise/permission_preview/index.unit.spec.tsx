import { mockSettings } from "__support__/settings";
import { PLUGIN_APPLICATION_PERMISSIONS, reinitialize } from "metabase/plugins";
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

    expect(PLUGIN_APPLICATION_PERMISSIONS.tabs).toEqual([
      { name: "Preview access", value: "preview-access" },
    ]);
    expect(PLUGIN_APPLICATION_PERMISSIONS.getRoutes()).not.toBeNull();
  });

  it("adds nothing without advanced permissions", () => {
    setup({ hasFeature: false });

    expect(PLUGIN_APPLICATION_PERMISSIONS.tabs).toEqual([]);
    expect(PLUGIN_APPLICATION_PERMISSIONS.getRoutes()).toBeNull();
  });
});
