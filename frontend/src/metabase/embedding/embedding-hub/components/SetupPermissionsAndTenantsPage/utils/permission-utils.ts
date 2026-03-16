import type {
  DatabaseId,
  FieldId,
  GroupId,
  GroupTableAccessPolicy,
  TableId,
} from "metabase-types/api";

export interface UpdateTenantDataAccessOptions {
  /** Database IDs to enable connection impersonation for */
  impersonatedDatabaseIds?: DatabaseId[];

  /** Tables to enable sandboxing (row-level security) for */
  sandboxedTables?: SandboxedTableConfig[];
}

/** Input type for creating/updating sandbox policies via the API */
type SandboxPolicyInput = Partial<Pick<GroupTableAccessPolicy, "id">> &
  Omit<GroupTableAccessPolicy, "id" | "permission_id">;

type SandboxedTableConfig = {
  /**
   * Existing sandbox ID.
   * If provided, updates the existing sandbox.
   **/
  id?: number;

  tableId: TableId;
  databaseId: DatabaseId;
  schemaName: string;

  /** The field to use for tenant filtering */
  filterFieldId: FieldId;
};

type DatabasePermissionGraph = Record<
  string,
  string | Record<string, string | Record<TableId, string>>
>;

/** All tables grouped by schema for each database */
export type AllSchemaTables = Record<DatabaseId, Record<string, TableId[]>>;

/**
 * Builds the permission graph structure for the API call.
 */
export function buildPermissionsGraph(
  groupId: GroupId,
  options: UpdateTenantDataAccessOptions,
  allSchemaTables?: AllSchemaTables,
  allDatabaseIds?: DatabaseId[],
): Record<GroupId, Record<DatabaseId, DatabasePermissionGraph>> {
  const { impersonatedDatabaseIds = [], sandboxedTables = [] } = options;

  const groupGraph: Record<DatabaseId, DatabasePermissionGraph> = {};

  // Add database-level impersonation permissions
  for (const databaseId of impersonatedDatabaseIds) {
    groupGraph[databaseId] = {
      "view-data": "impersonated",
      "create-queries": "query-builder",
    };
  }

  // Add table-level sandbox permissions
  for (const table of sandboxedTables) {
    const { databaseId, schemaName, tableId } = table;
    const schema = schemaName ?? "";

    if (!groupGraph[databaseId]) {
      groupGraph[databaseId] = { "create-queries": "query-builder" };
    }

    const dbPerms = groupGraph[databaseId];
    if (!dbPerms["view-data"] || typeof dbPerms["view-data"] === "string") {
      dbPerms["view-data"] = {};
    }

    const viewData = dbPerms["view-data"] as Record<
      string,
      string | Record<TableId, string>
    >;

    if (!viewData[schema]) {
      viewData[schema] = {};
    }

    (viewData[schema] as Record<TableId, string>)[tableId as TableId] =
      "sandboxed";
  }

  // Block non-selected tables and schemas within databases that have sandboxed tables
  if (allSchemaTables) {
    for (const [dbIdStr, schemas] of Object.entries(allSchemaTables)) {
      const databaseId = Number(dbIdStr) as DatabaseId;

      if (!groupGraph[databaseId]) {
        continue;
      }

      const dbPerms = groupGraph[databaseId];
      if (!dbPerms["view-data"] || typeof dbPerms["view-data"] === "string") {
        continue;
      }

      const viewData = dbPerms["view-data"] as Record<
        string,
        string | Record<TableId, string>
      >;

      for (const [schema, tableIds] of Object.entries(schemas)) {
        if (!viewData[schema]) {
          // Schema has no sandboxed tables — block the entire schema
          viewData[schema] = "blocked";
        } else if (typeof viewData[schema] === "object") {
          // Schema has sandboxed tables — block all non-selected tables
          const schemaPerms = viewData[schema] as Record<TableId, string>;
          for (const tableId of tableIds) {
            if (!schemaPerms[tableId]) {
              schemaPerms[tableId] = "blocked";
            }
          }
        }
      }
    }
  }

  // Block entire databases that have no sandboxed tables and are not impersonated
  if (allDatabaseIds) {
    for (const databaseId of allDatabaseIds) {
      if (!groupGraph[databaseId]) {
        groupGraph[databaseId] = {
          "view-data": "blocked",
          "create-queries": "no",
        };
      }
    }
  }

  return { [groupId]: groupGraph };
}

/**
 * Builds the sandbox policies array for the API call.
 */
export const buildSandboxPolicies = (
  groupId: GroupId,
  sandboxedTables: SandboxedTableConfig[] = [],
): SandboxPolicyInput[] =>
  sandboxedTables.map((table) => ({
    ...(table.id != null && { id: table.id }),
    table_id: Number(table.tableId),
    group_id: groupId,
    card_id: null,
    attribute_remappings: {
      organization_id: ["dimension", ["field", table.filterFieldId, null]],
    },
  }));
