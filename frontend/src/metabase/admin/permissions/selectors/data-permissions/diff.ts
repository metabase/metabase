import { createSelector } from "reselect";
import _ from "underscore";
import { State } from "metabase-types/store";
import Groups from "metabase/entities/groups";
import { diffDataPermissions } from "metabase/admin/permissions/utils/graph";
import { Group } from "metabase-types/api";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";

const getDatabasesWithTables = createSelector(
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
        id: database.id,
        name: database.name,
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
  state => state.admin.permissions.dataPermissions,
  state => state.admin.permissions.originalDataPermissions,
  (databases, groups, permissions, originalPermissions) =>
    diffDataPermissions(
      permissions,
      originalPermissions,
      groups as Group[],
      databases as any,
    ),
);
