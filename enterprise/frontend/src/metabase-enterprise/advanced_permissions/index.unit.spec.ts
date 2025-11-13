import { DataPermissionValue } from "metabase/admin/permissions/types";
import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_REDUCERS,
  getDefaultAdvancedPermissionsPlugin,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { initializePlugin, resetPlugin } from "./index";

// Mock the hasPremiumFeature function
jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

describe("Advanced Permissions Plugin", () => {
  beforeEach(() => {
    mockHasPremiumFeature.mockReset();
    // Reset all plugin state before each test
    resetPlugin();
  });

  afterEach(() => {
    // Clean up after each test
    resetPlugin();
  });

  describe("initializePlugin", () => {
    it("should not modify plugins when advanced_permissions feature is disabled", () => {
      mockHasPremiumFeature.mockReturnValue(false);

      const originalTableOptionsLength =
        PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length;
      const originalAdvancedPermissions = { ...PLUGIN_ADVANCED_PERMISSIONS };

      initializePlugin();

      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length).toBe(
        originalTableOptionsLength,
      );
      expect(PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions).toBe(
        originalAdvancedPermissions.addTablePermissionOptions,
      );
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(false);
    });

    it("should modify plugins when advanced_permissions feature is enabled", () => {
      mockHasPremiumFeature.mockReturnValue(true);

      // Arrays start empty after reset in beforeEach
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length).toBe(0);
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.length).toBe(0);
      expect(PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.length).toBe(0);
      expect(PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.length).toBe(0);

      initializePlugin();

      // Check that BLOCK_PERMISSION_OPTION was added to arrays
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length).toBe(1);
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.length).toBe(1);

      // Check that the last item is the BLOCK_PERMISSION_OPTION
      expect(
        PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS[
          PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length - 1
        ].value,
      ).toBe(DataPermissionValue.BLOCKED);
      expect(
        PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS[
          PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.length - 1
        ].value,
      ).toBe(DataPermissionValue.BLOCKED);

      // Check that routes were added
      expect(PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.length).toBe(1);
      expect(PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.length).toBe(1);

      // Check that advanced permissions properties were modified
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(true);
      expect(PLUGIN_ADVANCED_PERMISSIONS.defaultViewDataPermission).toBe(
        DataPermissionValue.BLOCKED,
      );
      expect(typeof PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission).toBe(
        "function",
      );
      expect(typeof PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions).toBe(
        "function",
      );

      // Check that post actions and reducers were added
      expect(
        PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS[
          DataPermissionValue.IMPERSONATED
        ],
      ).toBeDefined();
      expect(PLUGIN_REDUCERS.advancedPermissionsPlugin).toBeDefined();

      // Check that data permissions were modified
      expect(
        PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.length,
      ).toBeGreaterThan(0);
      expect(PLUGIN_DATA_PERMISSIONS.hasChanges.length).toBeGreaterThan(0);
      expect(
        typeof PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded,
      ).toBe("function");
      expect(
        typeof PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions,
      ).toBe("function");

      // Check database actions
      expect(
        PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS[
          DataPermissionValue.IMPERSONATED
        ].length,
      ).toBeGreaterThan(0);
    });
  });

  describe("resetPlugin", () => {
    it("should reset all plugin modifications to original state", () => {
      mockHasPremiumFeature.mockReturnValue(true);

      // Initialize the plugin first
      initializePlugin();

      // Verify plugin was initialized
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length).toBeGreaterThan(0);
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(true);
      expect(PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission).toBeDefined();

      // Reset the plugin
      resetPlugin();

      // Verify arrays are empty
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length).toBe(0);
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.length).toBe(0);
      expect(PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.length).toBe(0);
      expect(PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.length).toBe(0);
      expect(
        PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.length,
      ).toBe(0);
      expect(PLUGIN_DATA_PERMISSIONS.hasChanges.length).toBe(0);
      expect(
        PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS[
          DataPermissionValue.IMPERSONATED
        ].length,
      ).toBe(0);

      // Verify advanced permissions are reset to defaults
      const defaultPermissions = getDefaultAdvancedPermissionsPlugin();
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(
        defaultPermissions.shouldShowViewDataColumn,
      );
      expect(PLUGIN_ADVANCED_PERMISSIONS.defaultViewDataPermission).toBe(
        defaultPermissions.defaultViewDataPermission,
      );

      // Test function behavior instead of reference equality
      const testPermissions = [{ label: "test", value: "test" }];
      expect(
        PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions(
          testPermissions,
          "value",
        ),
      ).toEqual(testPermissions);
      expect(
        PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled(
          "value",
          "tables",
        ),
      ).toBe(false);
      expect(PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission("value")).toBe(
        false,
      );

      // Verify functions added by enterprise are removed
      expect(PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission).toBeUndefined();

      // Verify post actions and reducers are reset
      expect(
        PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS[
          DataPermissionValue.IMPERSONATED
        ],
      ).toBe(null);
      expect(PLUGIN_REDUCERS.advancedPermissionsPlugin).toBeUndefined();

      // Verify data permissions are reset
      expect(PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded).toBe(null);
      expect(
        (PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions as any)(), // the default fn doesn't care about arguments
      ).toBe(false);
    });
  });

  describe("plugin state management", () => {
    it("should allow multiple initialization and reset cycles", () => {
      mockHasPremiumFeature.mockReturnValue(true);

      // Initialize -> Reset -> Initialize -> Reset
      initializePlugin();
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(true);

      resetPlugin();
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(false);

      initializePlugin();
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(true);

      resetPlugin();
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(false);
    });

    it("should handle reset when plugin was never initialized", () => {
      mockHasPremiumFeature.mockReturnValue(false);

      // Reset without initializing should not throw
      expect(() => resetPlugin()).not.toThrow();

      // Verify state is in expected default condition
      const defaultPermissions = getDefaultAdvancedPermissionsPlugin();
      expect(PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn).toBe(
        defaultPermissions.shouldShowViewDataColumn,
      );
      expect(PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.length).toBe(0);
    });
  });
});
