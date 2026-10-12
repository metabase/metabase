import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { reinitialize } from "metabase/plugins";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { PLUGIN_APPLICATION_PERMISSIONS_SELECTORS } from "./plugins";
import {
  canAccessDataModel,
  getUserAttributes,
  getUserIsAdmin,
  getUserIsEntitledAnalyst,
} from "./selectors";

describe("metabase/current-user", () => {
  it("should return true if user is an admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(getUserIsAdmin(state)).toBe(true);
  });

  it("should return false if user is not an admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: false }),
    });

    expect(getUserIsAdmin(state)).toBe(false);
  });

  describe("getUserIsEntitledAnalyst", () => {
    const setup = ({
      isAnalyst,
      hasAdvancedPermissions,
    }: {
      isAnalyst: boolean;
      hasAdvancedPermissions: boolean;
    }) =>
      createMockState({
        currentUser: createMockUser({
          is_superuser: false,
          is_data_analyst: isAnalyst,
        }),
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            advanced_permissions: hasAdvancedPermissions,
          }),
        }),
      });

    it("is true for an analyst while the plan includes the feature", () => {
      const state = setup({ isAnalyst: true, hasAdvancedPermissions: true });

      expect(getUserIsEntitledAnalyst(state)).toBe(true);
    });

    it("is false for an analyst once the plan lost the feature", () => {
      const state = setup({ isAnalyst: true, hasAdvancedPermissions: false });

      expect(getUserIsEntitledAnalyst(state)).toBe(false);
    });

    it("is false for a non-analyst even with the feature", () => {
      const state = setup({ isAnalyst: false, hasAdvancedPermissions: true });

      expect(getUserIsEntitledAnalyst(state)).toBe(false);
    });
  });

  describe("canAccessDataModel", () => {
    afterEach(() => {
      reinitialize();
    });

    it("should return true for an admin", () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      });

      expect(canAccessDataModel(state)).toBe(true);
    });

    it("should return false for a non-admin by default", () => {
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
      });

      expect(canAccessDataModel(state)).toBe(false);
    });

    it("should return the plugin result for a non-admin", () => {
      PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canAccessDataModel = () => true;
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: false }),
      });

      expect(canAccessDataModel(state)).toBe(true);
    });

    it("should return false for an admin when the plugin denies access", () => {
      PLUGIN_APPLICATION_PERMISSIONS_SELECTORS.canAccessDataModel = () => false;
      const state = createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      });

      expect(canAccessDataModel(state)).toBe(false);
    });
  });

  describe("getUserAttributes", () => {
    it("should return user attributes including JWT-sourced attributes", () => {
      const state = createMockState({
        currentUser: createMockUser({
          attributes: { jwt_attr: "jwt_value", manual_attr: "manual_value" },
        }),
      });

      expect(getUserAttributes(state)).toEqual({
        jwt_attr: "jwt_value",
        manual_attr: "manual_value",
      });
    });

    it("should return empty object when attributes is null", () => {
      const state = createMockState({
        currentUser: createMockUser({ attributes: null }),
      });

      expect(getUserAttributes(state)).toEqual({});
    });

    it("should return empty object when no current user", () => {
      const state = createMockState({ currentUser: null });

      expect(getUserAttributes(state)).toEqual({});
    });
  });
});
