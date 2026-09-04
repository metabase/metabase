import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { diffDataPermissions } from "metabase/admin/permissions/utils/graph";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import type { GroupInfo } from "metabase-types/api";

export const getIsDirty = createSelector(
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (state: State) => state,
  (permissions, originalPermissions, state) =>
    !_.isEqual(permissions, originalPermissions) ||
    PLUGIN_DATA_PERMISSIONS.hasChanges.some((hasChanges) => hasChanges(state)),
);

interface DiffProps {
  groups: GroupInfo[];
}

/**
 * The save confirmation names the tables an edit granted or revoked, so it needs
 * the tables of every database the edit touched, not just the one on screen.
 * A database with no change contributes nothing, so passing every database the
 * tree has loaded is the same answer with none of the bookkeeping.
 */
export const getDiff = createSelector(
  (_state: State, { groups }: DiffProps) => groups,
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (state: State) => state.admin.permissions.databasesWithTables,
  (groups, permissions, originalPermissions, databasesWithTables) =>
    diffDataPermissions(
      permissions,
      originalPermissions,
      groups,
      Object.values(databasesWithTables),
    ),
);
