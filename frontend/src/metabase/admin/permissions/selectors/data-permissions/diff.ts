import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { diffDataPermissions } from "metabase/admin/permissions/utils/graph";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import { Group } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";

export const getIsDirty = createSelector(
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  PLUGIN_DATA_PERMISSIONS.hasChanges,
  (permissions, originalPermissions, hasExtraChanges) =>
    !_.isEqual(permissions, originalPermissions) || hasExtraChanges,
);

interface DiffProps {
  databases: Database[];
  groups: Group[];
}

export const getDiff = createSelector(
  (state: State, { databases }: DiffProps) => databases,
  (state: State, { groups }: DiffProps) => groups,
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (databases, groups, permissions, originalPermissions) =>
    diffDataPermissions(permissions, originalPermissions, groups, databases),
);
