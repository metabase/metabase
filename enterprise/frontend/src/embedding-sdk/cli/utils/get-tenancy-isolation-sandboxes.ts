import type {
  FieldReference,
  GroupTableAccessPolicy,
  Table,
} from "metabase-types/api";

type Options = {
  groupIds: number[];
  chosenTables: Table[];
  tenancyColumnNames: Record<string, string>;
};

type Sandbox = Pick<
  GroupTableAccessPolicy,
  "table_id" | "group_id" | "card_id" | "attribute_remappings"
>;

/**
 * Generates sandboxes for tenancy isolation for defining the permissions graph.
 */
export function getTenancyIsolationSandboxes(options: Options): Sandbox[] {
  const sandboxes: Sandbox[] = [];

  const { tenancyColumnNames, chosenTables, groupIds } = options;

  // Define column-based tenant isolation for each chosen tables
  for (const tableId in tenancyColumnNames) {
    const table = chosenTables.find(t => Number(t.id) === Number(tableId));

    const tenancyColumnName = tenancyColumnNames[tableId];

    if (!table || !tenancyColumnName) {
      continue;
    }

    for (const groupId of groupIds) {
      const tenancyField = table.fields?.find(
        f => f.name === tenancyColumnName,
      );

      if (!tenancyField) {
        continue;
      }

      // Create a field reference for sandboxing.
      // This refers to the tenant column in our own table (e.g. tenant_id)
      // example: ["field", 243, { "base-type": "type/Integer" }]
      const tenancyFieldRef: FieldReference = [
        "field",
        Number(tenancyField.id),
        { "base-type": tenancyField.base_type },
      ];

      sandboxes.push({
        card_id: null,
        group_id: groupId,
        table_id: parseInt(tableId, 10),
        attribute_remappings: {
          [tenancyColumnName]: ["dimension", tenancyFieldRef],
        },
      });
    }
  }

  return sandboxes;
}
