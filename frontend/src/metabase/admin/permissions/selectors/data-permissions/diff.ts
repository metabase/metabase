import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import { diffDataPermissions } from "metabase/admin/permissions/utils/graph";
import Groups from "metabase/entities/groups";
import { getMetadata } from "metabase/selectors/metadata";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";

import { State } from "metabase-types/store";

const getDatabasesWithTables = createSelector(getMetadata, metadata =>
  metadata
    .databasesList({ savedQuestions: false })
    .map(db => db.getPlainObject()),
);

export const getIsDirty = createSelector(
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  PLUGIN_DATA_PERMISSIONS.hasChanges,
  (permissions, originalPermissions, hasExtraChanges) =>
    !_.isEqual(permissions, originalPermissions) || hasExtraChanges,
);

export const getDiff = createSelector(
  getDatabasesWithTables,
  Groups.selectors.getList,
  (state: State) => state.admin.permissions.dataPermissions,
  (state: State) => state.admin.permissions.originalDataPermissions,
  (databases, groups, permissions, originalPermissions) =>
    diffDataPermissions(permissions, originalPermissions, groups, databases),
);
