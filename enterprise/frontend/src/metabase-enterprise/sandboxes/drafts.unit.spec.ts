import type {
  AppliedDataPermissionUpdate,
  DataPermissionsDrafts,
} from "metabase/plugins";
import type { GroupTableAccessPolicy } from "metabase-types/api";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { removeUnsandboxedDrafts, setSandboxDraft } from "./drafts";

const createPolicy = (
  groupId: number,
  tableId: number,
): GroupTableAccessPolicy => ({
  id: tableId,
  group_id: groupId,
  table_id: tableId,
  card_id: null,
  attribute_remappings: {},
  permission_id: null,
});

const DATABASE = createMockDatabase({
  id: 1,
  tables: [
    createMockTable({ id: 5, db_id: 1, schema: "public" }),
    createMockTable({ id: 6, db_id: 1, schema: "other" }),
  ],
});

const DRAFTS: DataPermissionsDrafts = {
  sandboxes: {
    "2:5": createPolicy(2, 5),
    "2:6": createPolicy(2, 6),
    "3:5": createPolicy(3, 5),
  },
  impersonations: [],
};

const createUpdate = (
  update: Partial<AppliedDataPermissionUpdate>,
): AppliedDataPermissionUpdate => ({
  groupId: 2,
  entityId: { databaseId: 1 },
  type: DataPermissionType.ACCESS,
  permission: DataPermission.VIEW_DATA,
  value: DataPermissionValue.UNRESTRICTED,
  database: DATABASE,
  ...update,
});

describe("setSandboxDraft", () => {
  it("adds a policy keyed by its group and table", () => {
    const policy = createPolicy(4, 5);

    expect(setSandboxDraft(policy)(DRAFTS).sandboxes["4:5"]).toBe(policy);
  });
});

describe("removeUnsandboxedDrafts", () => {
  it("drops a table's policy when the table stops being sandboxed", () => {
    const drafts = removeUnsandboxedDrafts(
      DRAFTS,
      createUpdate({
        entityId: { databaseId: 1, schemaName: "public", tableId: 5 },
      }),
    );

    expect(Object.keys(drafts.sandboxes)).toEqual(["2:6", "3:5"]);
  });

  it("keeps a table's policy when the table is sandboxed", () => {
    const drafts = removeUnsandboxedDrafts(
      DRAFTS,
      createUpdate({
        entityId: { databaseId: 1, schemaName: "public", tableId: 5 },
        value: DataPermissionValue.SANDBOXED,
      }),
    );

    expect(drafts).toBe(DRAFTS);
  });

  it("drops the group's policies for every table of a changed schema", () => {
    const drafts = removeUnsandboxedDrafts(
      DRAFTS,
      createUpdate({ entityId: { databaseId: 1, schemaName: "public" } }),
    );

    expect(Object.keys(drafts.sandboxes)).toEqual(["2:6", "3:5"]);
  });

  it("drops the group's policies for every table of a changed database", () => {
    const drafts = removeUnsandboxedDrafts(DRAFTS, createUpdate({}));

    expect(Object.keys(drafts.sandboxes)).toEqual(["3:5"]);
  });
});
