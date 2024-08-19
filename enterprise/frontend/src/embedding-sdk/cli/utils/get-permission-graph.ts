import type {
  GroupTableAccessPolicy,
  PermissionsGraph,
} from "metabase-types/api";

type Options = {
  groupIds: number[];
  tenancyColumnNames: Record<string, string>;
};

type Sandbox = Pick<
  GroupTableAccessPolicy,
  "table_id" | "group_id" | "card_id" | "attribute_remappings"
>;

type Graph = PermissionsGraph & {
  sandboxes: Sandbox[];
};

export function getPermissionGraph(options: Options): Graph {
  const groups: Graph["groups"] = {};
  const sandboxes: Sandbox[] = [];

  // TODO: derive selected and unselected tables from the table ids
  // const selectedTables: number[] = [];
  // const unselectedTables: number[] = [];

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

  return {
    groups,
    sandboxes,
    revision: 1,
  };
}
