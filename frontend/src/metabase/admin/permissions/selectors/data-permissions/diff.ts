import { createSelector } from "@reduxjs/toolkit";
import type { Selector } from "@reduxjs/toolkit";
import _ from "underscore";

import { diffDataPermissions } from "metabase/admin/permissions/utils/graph";
import Groups from "metabase/entities/groups";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";

import { Database } from "metabase-types/api";
import { State } from "metabase-types/store";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";

const getDatabasesWithTables: Selector<State, Database[]> = createSelector(
  (state: State) => state.entities.databases,
  (state: State) => state.entities.tables,
  (databases, tables) => {
    if (!databases || !tables) {
      return [];
    }
    const databasesList = Object.values(databases);
    const tablesList = Object.values(tables);

    return databasesList.map(database => {
      const databaseTables = tablesList.filter(
        table => table.db_id === database.id && !isVirtualCardId(table.id),
      );

      return {
        ...database,
        tables: databaseTables,
      };
    });
  },
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
