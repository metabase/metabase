import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type {
  DatabasePermissions,
  GroupTableAccessPolicy,
  PermissionsGraph,
} from "metabase-types/api";

type Options = {
  groupIds: number[];
  sandboxedTableIds: number[];
  tenancyColumnNames: Record<string, string>;
  schemaKey: string;
};

type Sandbox = Pick<
  GroupTableAccessPolicy,
  "table_id" | "group_id" | "card_id" | "attribute_remappings"
>;

type Graph = Omit<PermissionsGraph, "revision"> & {
  sandboxes: Sandbox[];
};

const PERMISSIONS_BLOCKED: DatabasePermissions = {
  [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
  [DataPermission.DOWNLOAD]: { schemas: DataPermissionValue.FULL },
  [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
};

export function getPermissionGraph(options: Options): Graph {
  const { schemaKey, sandboxedTableIds = [] } = options;

  const groups: Graph["groups"] = {};
  const sandboxes: Sandbox[] = [];

  // TODO: make these IDs dynamic
  const ALL_USERS_GROUP_ID = 1;
  const SAMPLE_DB_ID = 1;
  const CONNECTED_DB_ID = 2;

  // Block access to everything from the "All Users" group
  groups[ALL_USERS_GROUP_ID] = {
    [SAMPLE_DB_ID]: PERMISSIONS_BLOCKED,
    [CONNECTED_DB_ID]: PERMISSIONS_BLOCKED,
  };

  const getSchemaPermission = <T extends DataPermissionValue>(value: T) => ({
    [schemaKey]: Object.fromEntries(sandboxedTableIds.map(id => [id, value])),
  });

  for (const groupId of options.groupIds) {
    groups[groupId][CONNECTED_DB_ID] = {
      [DataPermission.CREATE_QUERIES]: getSchemaPermission(
        DataPermissionValue.QUERY_BUILDER,
      ),

      [DataPermission.DOWNLOAD]: {
        schemas: getSchemaPermission(DataPermissionValue.FULL),
      },

      // TODO: we might need the "unrestricted" permission for unselected tables
      [DataPermission.VIEW_DATA]: getSchemaPermission(
        DataPermissionValue.SANDBOXED,
      ),
    };
  }

  // Add permissions sandboxing for each table
  for (const tableId in options.tenancyColumnNames) {
    for (const groupId of options.groupIds) {
      const columnName = options.tenancyColumnNames[tableId];

      // TODO: fetch the field metadata based on the tenancy column name
      // example: ["field", 243, { "base-type": "type/Integer", "source-field": 263 }]
      // example: ["field", 243, { "base-type": "type/Integer" }]
      // example: ["field", 259, { "base-type": "type/Integer" }]
      const field = ["field", 255, null];

      sandboxes.push({
        group_id: groupId,
        table_id: parseInt(tableId, 10),
        attribute_remappings: { [columnName]: ["dimension", field] },
        card_id: null,
      });
    }
  }

  return { groups, sandboxes };
}
