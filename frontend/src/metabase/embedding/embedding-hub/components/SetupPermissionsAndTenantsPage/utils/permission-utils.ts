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
  string | Record<string, Record<TableId, string>>
>;

/**
 * Builds the permission graph structure for the API call.
 */
export function buildPermissionsGraph(
  groupId: GroupId,
  options: UpdateTenantDataAccessOptions,
): Record<GroupId, Record<DatabaseId, DatabasePermissionGraph>> {
  const { impersonatedDatabaseIds = [], sandboxedTables = [] } = options;

  const groupGraph: Record<DatabaseId, DatabasePermissionGraph> = {};

  // Add database-level impersonation permissions
  for (const databaseId of impersonatedDatabaseIds) {
    groupGraph[databaseId] = { "view-data": "impersonated" };
  }

  // Add table-level sandbox permissions
  for (const table of sandboxedTables) {
    const { databaseId, schemaName, tableId } = table;
    const schema = schemaName ?? "";

    if (!groupGraph[databaseId]) {
      groupGraph[databaseId] = {};
    }

    const dbPerms = groupGraph[databaseId];
    if (!dbPerms["view-data"] || typeof dbPerms["view-data"] === "string") {
      dbPerms["view-data"] = {};
    }

    const viewData = dbPerms["view-data"] as Record<
      string,
      Record<TableId, string>
    >;

    if (!viewData[schema]) {
      viewData[schema] = {};
    }

    viewData[schema][tableId as TableId] = "sandboxed";
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
      tenant_identifier: ["dimension", ["field", table.filterFieldId, null]],
    },
  }));
