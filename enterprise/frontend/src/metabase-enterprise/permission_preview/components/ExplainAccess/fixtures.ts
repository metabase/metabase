import type {
  PermissionDebugAccess,
  PermissionDebugAnswer,
  PermissionDebugCollection,
  PermissionDebugGroupValue,
  PermissionDebugSandbox,
  PermissionDebugSqlCard,
  PermissionDebugTable,
  PermissionDebugTablePermission,
} from "metabase-types/api";

const GROUP_IDS: Record<string, number> = {
  "All Users": 1,
  Sales: 9,
  Support: 10,
  "Data Analysts": 11,
};

export function createGroupValue(
  groupName: string,
  value: string,
  applies = false,
): PermissionDebugGroupValue {
  return {
    "group-id": GROUP_IDS[groupName],
    "group-name": groupName,
    value,
    "applies?": applies,
  };
}

function createPermission(
  value: string,
  groups: PermissionDebugGroupValue[],
): PermissionDebugTablePermission {
  return { value, groups };
}

export function createSandbox(
  opts: Partial<PermissionDebugSandbox> = {},
): PermissionDebugSandbox {
  return {
    "sandbox-id": 1,
    "table-id": 1,
    "group-id": 9,
    "group-name": "Sales",
    "enforced?": true,
    "columns-limited?": false,
    filters: [
      {
        attribute: "category",
        value: "Gizmo",
        column: "Products.Category",
        "missing?": false,
      },
    ],
    ...opts,
  };
}

export function createTable(
  opts: Partial<PermissionDebugTable> = {},
): PermissionDebugTable {
  return {
    "table-id": 1,
    "db-id": 1,
    "db-name": "Sample Database",
    schema: "PUBLIC",
    name: "Orders",
    "view-data": createPermission("unrestricted", [
      createGroupValue("Sales", "unrestricted", true),
      createGroupValue("All Users", "blocked"),
    ]),
    "create-queries": createPermission("query-builder", [
      createGroupValue("Sales", "query-builder", true),
      createGroupValue("All Users", "no"),
    ]),
    "download-results": createPermission("one-million-rows", [
      createGroupValue("Sales", "one-million-rows", true),
    ]),
    sandboxes: [],
    ...opts,
  };
}

export function createSqlCard(
  opts: Partial<PermissionDebugSqlCard> = {},
): PermissionDebugSqlCard {
  return { "card-id": 12, name: "Orders in SQL", "db-id": 1, ...opts };
}

export function createCollection(
  opts: Partial<PermissionDebugCollection> = {},
): PermissionDebugCollection {
  return {
    "collection-id": 5,
    name: "Sales reports",
    "personal?": false,
    value: "curate",
    "by-rule": false,
    groups: [
      createGroupValue("Sales", "curate", true),
      createGroupValue("All Users", "none"),
    ],
    ...opts,
  };
}

export function createAnswer(
  opts: Partial<PermissionDebugAnswer> = {},
): PermissionDebugAnswer {
  return {
    decision: "allow",
    outcome: "allowed",
    "model-type": "card",
    "model-id": "12",
    segment: [],
    message: [],
    data: {},
    reasons: { collection: createCollection() },
    ...opts,
  };
}

export function createAccess(
  opts: Partial<PermissionDebugAccess> = {},
): PermissionDebugAccess {
  return { collections: [], reasons: { tables: [] }, ...opts };
}
