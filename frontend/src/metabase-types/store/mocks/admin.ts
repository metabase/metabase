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
  people: {
    temporaryPasswords: {},
  },
  datamodel: {
    previewSummary: null,
    revisions: null,
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
    dataPermissionsRevision: null,
    collectionPermissions: {},
    originalCollectionPermissions: {},
    collectionPermissionsRevision: null,
    tenantCollectionPermissions: {},
    originalTenantCollectionPermissions: {},
    tenantCollectionPermissionsRevision: null,
    tenantSpecificCollectionPermissions: {},
    originalTenantSpecificCollectionPermissions: {},
    tenantSpecificCollectionPermissionsRevision: null,
    isHelpReferenceOpen: false,
    hasRevisionChanged: {
      revision: null,
      hasChanged: false,
    },
    ...opts,
  };
};
