import {
  DataPermission,
  DataPermissionValue,
  type DatabasePermissions,
} from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { getUnsavedEdits } from "./unsaved-edits";

const SALES_GROUP_ID = 5;
const DATABASE_ID = 1;

const DATABASES = [
  {
    id: DATABASE_ID,
    name: "Sample Database",
    tables: [
      createMockTable({
        id: 2,
        db_id: 1,
        schema: "PUBLIC",
        display_name: "Orders",
      }),
      createMockTable({
        id: 4,
        db_id: 1,
        schema: "PUBLIC",
        display_name: "Reviews",
      }),
    ],
  },
];

const GROUP_NAMES = new Map([[SALES_GROUP_ID, "Sales"]]);

function setup({
  before,
  after,
}: {
  before: DatabasePermissions;
  after: DatabasePermissions;
}) {
  return getUnsavedEdits({
    modifiedGroups: { [SALES_GROUP_ID]: { [DATABASE_ID]: after } },
    originalGroups: { [SALES_GROUP_ID]: { [DATABASE_ID]: before } },
    groupNames: GROUP_NAMES,
    databases: DATABASES,
  });
}

describe("getUnsavedEdits", () => {
  it("lists a database-level change as one row for the database", () => {
    expect(
      setup({
        before: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
        },
        after: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]: DataPermissionValue.QUERY_BUILDER,
        },
      }),
    ).toEqual([
      {
        group_id: SALES_GROUP_ID,
        group_name: "Sales",
        database_id: DATABASE_ID,
        label: "Sample Database",
        permission: "Create queries",
        before: "No",
        after: "Query builder only",
      },
    ]);
  });

  it("lists a granular change as one row per table whose value changed", () => {
    expect(
      setup({
        before: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
        },
        after: {
          [DataPermission.VIEW_DATA]: {
            PUBLIC: {
              2: DataPermissionValue.BLOCKED,
              4: DataPermissionValue.UNRESTRICTED,
            },
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        table_id: 4,
        label: "Sample Database · Reviews",
        permission: "View data",
        before: "Blocked",
        after: "Can view",
      }),
    ]);
  });

  it("names a download value, which the graph keeps under `schemas`", () => {
    expect(
      setup({
        before: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.DOWNLOAD]: { schemas: DataPermissionValue.NONE },
        },
        after: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.DOWNLOAD]: { schemas: DataPermissionValue.LIMITED },
        },
      }).map(({ permission, before, after }) => [permission, before, after]),
    ).toEqual([["Download results", "No", "10 thousand rows"]]);
  });

  it("lists nothing for a value an edit only writes out, where nothing was set before", () => {
    expect(
      setup({
        before: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
        },
        after: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.TRANSFORMS]: DataPermissionValue.NO,
        },
      }),
    ).toEqual([]);
  });

  it("lists nothing when an edit was undone", () => {
    const permissions: DatabasePermissions = {
      [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
    };
    expect(setup({ before: permissions, after: { ...permissions } })).toEqual(
      [],
    );
  });
});
