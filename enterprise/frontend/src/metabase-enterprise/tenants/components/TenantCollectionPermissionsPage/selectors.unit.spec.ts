import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import type { CollectionPermissions } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import {
  createMockAdminState,
  createMockState,
} from "metabase-types/store/mocks";

import {
  getCurrentTenantCollectionId,
  getIsTenantDirty,
  tenantCollectionsQuery,
} from "./selectors";

// Note: The more complex selectors (getTenantCollectionsSidebar,
// getTenantCollectionsPermissionEditor, getTenantCollectionEntity)
// depend on entity framework state which requires full store setup.
// These are better tested via integration tests.

const ADMIN_GROUP_ID = 2;
const ALL_USERS_GROUP_ID = 1;

const createMockStateWithPermissions = ({
  tenantCollectionPermissions = {},
  originalTenantCollectionPermissions = {},
}: {
  tenantCollectionPermissions?: CollectionPermissions;
  originalTenantCollectionPermissions?: CollectionPermissions;
} = {}): State => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ tenants: true }),
    }),
    admin: createMockAdminState({
      permissions: {
        dataPermissions: {},
        originalDataPermissions: {},
        collectionPermissions: {},
        originalCollectionPermissions: {},
        tenantCollectionPermissions,
        originalTenantCollectionPermissions,
        isHelpReferenceOpen: false,
        hasRevisionChanged: { revision: null, hasChanged: false },
      },
    }),
  });

  return state as unknown as State;
};

describe("TenantCollectionPermissionsPage selectors", () => {
  beforeEach(() => {
    setupEnterprisePlugins();
  });

  describe("tenantCollectionsQuery", () => {
    it("should have correct query parameters", () => {
      expect(tenantCollectionsQuery).toEqual({
        tree: true,
        "exclude-other-user-collections": true,
        "exclude-archived": true,
        namespace: "shared-tenant-collection",
      });
    });
  });

  describe("getIsTenantDirty", () => {
    it("should return false when permissions are unchanged", () => {
      const permissions: CollectionPermissions = {
        [ADMIN_GROUP_ID]: { root: "write", 100: "write" },
        [ALL_USERS_GROUP_ID]: { root: "none", 100: "none" },
      };

      const state = createMockStateWithPermissions({
        tenantCollectionPermissions: permissions,
        originalTenantCollectionPermissions: permissions,
      });

      expect(getIsTenantDirty(state)).toBe(false);
    });

    it("should return true when permissions are changed", () => {
      const state = createMockStateWithPermissions({
        tenantCollectionPermissions: {
          [ADMIN_GROUP_ID]: { root: "write", 100: "write" },
          [ALL_USERS_GROUP_ID]: { root: "read", 100: "read" },
        },
        originalTenantCollectionPermissions: {
          [ADMIN_GROUP_ID]: { root: "write", 100: "write" },
          [ALL_USERS_GROUP_ID]: { root: "none", 100: "none" },
        },
      });

      expect(getIsTenantDirty(state)).toBe(true);
    });

    it("should return false when both are empty objects", () => {
      const state = createMockStateWithPermissions({
        tenantCollectionPermissions: {},
        originalTenantCollectionPermissions: {},
      });

      expect(getIsTenantDirty(state)).toBe(false);
    });

    it("should detect deeply nested permission changes", () => {
      const state = createMockStateWithPermissions({
        tenantCollectionPermissions: {
          [ADMIN_GROUP_ID]: { root: "write", 100: "write", 101: "read" },
        },
        originalTenantCollectionPermissions: {
          [ADMIN_GROUP_ID]: { root: "write", 100: "write", 101: "none" },
        },
      });

      expect(getIsTenantDirty(state)).toBe(true);
    });
  });

  describe("getCurrentTenantCollectionId", () => {
    it("should return undefined when collectionId is null", () => {
      const state = createMockStateWithPermissions();
      const props = { params: { collectionId: null as any } };

      expect(getCurrentTenantCollectionId(state, props)).toBeUndefined();
    });

    it("should return undefined when collectionId is undefined", () => {
      const state = createMockStateWithPermissions();
      const props = { params: { collectionId: undefined as any } };

      expect(getCurrentTenantCollectionId(state, props)).toBeUndefined();
    });

    it("should return root for root collection", () => {
      const state = createMockStateWithPermissions();
      const props = { params: { collectionId: "root" } };

      expect(getCurrentTenantCollectionId(state, props)).toBe("root");
    });

    it("should return parsed integer for string numeric collection id", () => {
      const state = createMockStateWithPermissions();
      const props = { params: { collectionId: "100" } };

      expect(getCurrentTenantCollectionId(state, props)).toBe(100);
    });

    it("should handle numeric collection id", () => {
      const state = createMockStateWithPermissions();
      const props = { params: { collectionId: 100 as any } };

      expect(getCurrentTenantCollectionId(state, props)).toBe(100);
    });

    it("should handle large collection ids", () => {
      const state = createMockStateWithPermissions();
      const props = { params: { collectionId: "999999" } };

      expect(getCurrentTenantCollectionId(state, props)).toBe(999999);
    });
  });
});
