import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type { DatabasePermissionInfo } from "metabase/admin/permissions/utils/database-metadata";
import type { SchemasPermissions } from "metabase-types/api";

import { upgradeViewPermissionsIfNeeded } from "./graph";

const groupId = 10;
const databaseId = 20;
const schema = "my_schema";
const tableId = 30;
const entityId = { databaseId };

/**
 * Helper to create a mock database that satisfies DatabasePermissionInfo.
 */
function createMockDatabasePermissionInfo(
  schemas: Array<{ name: string; tables: Array<{ id: number }> }>,
): DatabasePermissionInfo {
  const schemaInfos = schemas.map((s) => ({
    name: s.name,
    getTables: () =>
      s.tables.map((t) => ({
        id: t.id,
        db_id: databaseId,
        schema_name: s.name || null,
      })),
  }));

  return {
    schemas: schemaInfos,
    schema: (name: string | undefined) =>
      schemaInfos.find((s) => s.name === (name ?? "")) ?? null,
    getTables: () =>
      schemas.flatMap((s) =>
        s.tables.map((t) => ({
          id: t.id,
          db_id: databaseId,
          schema_name: s.name || null,
        })),
      ),
  };
}

const database = createMockDatabasePermissionInfo([
  { name: schema, tables: [{ id: tableId }] },
]);

const createGraph = (viewPermissions: SchemasPermissions) => ({
  [groupId]: {
    [databaseId]: {
      [DataPermission.VIEW_DATA]: viewPermissions,
    },
  },
});

describe("upgradeViewPermissionsIfNeeded", () => {
  it.each([
    createGraph(DataPermissionValue.BLOCKED),
    createGraph(DataPermissionValue.NO),
    createGraph({ [schema]: DataPermissionValue.UNRESTRICTED }),
    createGraph({ [schema]: { [tableId]: DataPermissionValue.UNRESTRICTED } }),
    createGraph({ [schema]: { [tableId]: DataPermissionValue.SANDBOXED } }),
  ])(
    "should upgrade data access permission if it is not fully granted except impersonated",
    (graph) => {
      const updatedGraph = upgradeViewPermissionsIfNeeded(
        graph,
        groupId,
        entityId,
        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        database,
      );

      expect(updatedGraph).toStrictEqual({
        [groupId]: {
          [databaseId]: {
            [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          },
        },
      });
    },
  );

  it("should not upgrade data access permission if it is impersonated", () => {
    const graph = createGraph(DataPermissionValue.IMPERSONATED);
    const updatedGraph = upgradeViewPermissionsIfNeeded(
      graph,
      groupId,
      entityId,
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      database,
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.IMPERSONATED,
        },
      },
    });
  });
});
