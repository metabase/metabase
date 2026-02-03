import type { AdminAppState, AdminState } from "metabase-types/store";

export const createMockAdminState = (
  opts?: Partial<AdminState>,
): AdminState => ({
  app: createMockAdminAppState(),
  permissions: createMockPermissionsState(),
  databases: {
    deletionError: null,
    deletes: [],
  },
  ...opts,
});

export const createMockAdminAppState = (
  opts?: Partial<AdminAppState>,
): AdminAppState => ({
  paths: [],
  ...opts,
});

export const createMockPermissionsState = (
  opts?: Partial<AdminState["permissions"]>,
): AdminState["permissions"] => {
  return {
    dataPermissions: {},
    originalDataPermissions: {},
    collectionPermissions: {},
    originalCollectionPermissions: {},
    tenantCollectionPermissions: {},
    originalTenantCollectionPermissions: {},
    isHelpReferenceOpen: false,
    hasRevisionChanged: {
      revision: null,
      hasChanged: false,
    },
    ...opts,
  };
};
