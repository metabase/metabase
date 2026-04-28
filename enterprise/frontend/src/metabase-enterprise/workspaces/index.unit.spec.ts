import { mockSettings } from "__support__/settings";
import { PLUGIN_WORKSPACES, reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { initializePlugin } from "./index";

type SetupOpts = {
  hasWorkspaces: boolean;
};

function setup({ hasWorkspaces }: SetupOpts) {
  mockSettings({
    "token-features": createMockTokenFeatures({ workspaces: hasWorkspaces }),
  });
  initializePlugin();
}

describe("workspaces plugin", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should enable the plugin when the workspaces premium feature is set", () => {
    setup({ hasWorkspaces: true });

    expect(PLUGIN_WORKSPACES.isEnabled).toBe(true);
    expect(PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes()).not.toBeNull();
  });

  it("should leave the plugin disabled when the workspaces premium feature is not set", () => {
    setup({ hasWorkspaces: false });

    expect(PLUGIN_WORKSPACES.isEnabled).toBe(false);
    expect(PLUGIN_WORKSPACES.getDataStudioWorkspaceRoutes()).toBeNull();
  });

  describe("canManageWorkspaces", () => {
    beforeEach(() => {
      setup({ hasWorkspaces: true });
    });

    it("should return true for admins", () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      });

      expect(PLUGIN_WORKSPACES.canManageWorkspaces(state)).toBe(true);
    });

    it("should return false for non-admins", () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
      });

      expect(PLUGIN_WORKSPACES.canManageWorkspaces(state)).toBe(false);
    });
  });
});
