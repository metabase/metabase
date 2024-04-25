import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import Database from "metabase-lib/v1/metadata/Database";
import type { SchemasPermissions } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { upgradeViewPermissionsIfNeeded } from "./graph";

const groupId = 10;
const databaseId = 20;
const schema = "my_schema";
const tableId = 30;
const entityId = { databaseId };

const database = new Database({
  ...createMockDatabase({ id: entityId.databaseId }),
  schemas: [schema],
  tables: [tableId],
});

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
    graph => {
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
