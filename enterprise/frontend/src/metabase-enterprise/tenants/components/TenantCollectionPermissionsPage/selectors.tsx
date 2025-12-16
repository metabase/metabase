import { createSelector } from "@reduxjs/toolkit";

import { getCurrentCollectionId } from "metabase/admin/permissions/selectors/collection-permissions";
import type { CollectionPermissions } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { getTenantCollectionPermissionsConfig } from "./config";

// Re-export the collections query from config for backward compatibility
export const tenantCollectionsQuery =
  getTenantCollectionPermissionsConfig().collectionsQuery;

// Re-export getCurrentCollectionId as getCurrentTenantCollectionId for tests
export const getCurrentTenantCollectionId = getCurrentCollectionId;

// Tenant-specific isDirty selector
export const getIsTenantDirty = createSelector(
  (state: State) => state.admin.permissions.tenantCollectionPermissions,
  (state: State) => state.admin.permissions.originalTenantCollectionPermissions,
  (
    permissions: CollectionPermissions,
    originalPermissions: CollectionPermissions,
  ) => JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);
