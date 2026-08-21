import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { diffDataPermissions } from "metabase/admin/permissions/utils/graph";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import type {
  DatabaseId,
  GroupInfo,
  PermissionsDatabase,
} from "metabase-types/api";

export const getIsDirty = createSelector(
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (state: State) => state,
  (permissions, originalPermissions, state) =>
    !_.isEqual(permissions, originalPermissions) ||
    PLUGIN_DATA_PERMISSIONS.hasChanges.some((hasChanges) => hasChanges(state)),
);

/**
 * The databases whose permissions differ from the saved graph. The confirmation
 * modal only needs tables for these, so `DataPermissionsPage` keeps exactly
 * their `getDatabaseMetadata` requests subscribed.
 */
export const getChangedDatabaseIds = createSelector(
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (permissions, originalPermissions): DatabaseId[] => {
    if (permissions == null || originalPermissions == null) {
      return [];
    }

    const changed = new Set<DatabaseId>();

    for (const groupId of Object.keys(permissions)) {
      const group = permissions[groupId] ?? {};
      const originalGroup = originalPermissions[groupId] ?? {};
      const databaseIds = new Set([
        ...Object.keys(group),
        ...Object.keys(originalGroup),
      ]);

      for (const databaseId of databaseIds) {
        const id = Number(databaseId);
        if (!_.isEqual(group[id], originalGroup[id])) {
          changed.add(id);
        }
      }
    }

    return [...changed];
  },
);

interface DiffProps {
  databases: PermissionsDatabase[];
  groups: GroupInfo[];
}

export const getDiff = createSelector(
  (state: State, { databases }: DiffProps) => databases,
  (state: State, { groups }: DiffProps) => groups,
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (databases, groups, permissions, originalPermissions) =>
    diffDataPermissions(permissions, originalPermissions, groups, databases),
);
