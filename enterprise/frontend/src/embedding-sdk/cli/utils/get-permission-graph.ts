import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type {
  Table,
  DatabasePermissions,
  GroupTableAccessPolicy,
  PermissionsGraph,
} from "metabase-types/api";

type Options = {
  tables: Table[];
  groupIds: number[];
  tenancyColumnNames: Record<string, string>;
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
  const { tables = [] } = options;

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

  const getDatabasePermission = <T extends DataPermissionValue>(value: T) => {
    // Tables could be picked from multiple schemas, so we need to group them by schema.
    const schemas: Record<string, Record<string, T>> = {};

    for (const table of tables) {
      if (!schemas[table.schema]) {
        schemas[table.schema] = {};
      }

      schemas[table.schema][table.id] = value;
    }

    return schemas;
  };

  for (const groupId of options.groupIds) {
    groups[groupId][CONNECTED_DB_ID] = {
      [DataPermission.CREATE_QUERIES]: getDatabasePermission(
        DataPermissionValue.QUERY_BUILDER,
      ),

      [DataPermission.DOWNLOAD]: {
        schemas: getDatabasePermission(DataPermissionValue.FULL),
      },

      // TODO: we might need the "unrestricted" permission for unselected tables
      [DataPermission.VIEW_DATA]: getDatabasePermission(
        DataPermissionValue.SANDBOXED,
      ),
    };
  }

  // Add permissions sandboxing for each table
  for (const tableId in options.tenancyColumnNames) {
    const table = tables.find(t => t.id === tableId);
    const tenancyColumnName = options.tenancyColumnNames[tableId];

    if (!table || !tenancyColumnName) {
      continue;
    }

    for (const groupId of options.groupIds) {
      // TODO: fetch the field metadata based on the tenancy column name
      // example: ["field", 243, { "base-type": "type/Integer", "source-field": 263 }]
      // example: ["field", 243, { "base-type": "type/Integer" }]
      // example: ["field", 259, { "base-type": "type/Integer" }]

      // console.log(
      //   `--- table ${table.name} has ${table.fields?.length} fields ---`,
      // );

      const tenancyField = table.fields?.find(
        f => f.name === tenancyColumnName,
      );

      if (!tenancyField?.field_ref) {
        continue;
      }

      sandboxes.push({
        group_id: groupId,
        table_id: parseInt(tableId, 10),
        attribute_remappings: {
          [tenancyColumnName]: ["dimension", tenancyField.field_ref],
        },
        card_id: null,
      });
    }
  }

  return { groups, sandboxes };
}
