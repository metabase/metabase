import Database from "metabase-lib/v1/metadata/Database";
import type { SchemasPermissions, NativePermissions } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";

import { updateNativePermission } from "./graph";
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

const createGraph = (
  viewPermissions: SchemasPermissions,
  createPermissions?: NativePermissions,
) => ({
  [groupId]: {
    [databaseId]: {
      [DataPermission.VIEW_DATA]: viewPermissions,
      ...(createPermissions
        ? { [DataPermission.CREATE_QUERIES]: createPermissions }
        : {}),
    },
  },
});

describe("updateNativePermission", () => {
  it("should revoke create queries permission and keep the view data permission", () => {
    const graph = createGraph(
      DataPermissionValue.UNRESTRICTED,
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    );
    const updatedGraph = updateNativePermission(
      graph,
      groupId,
      entityId,
      DataPermissionValue.NO,
      database,
      DataPermission.CREATE_QUERIES,
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
        },
      },
    });
  });

  it("should grant native query permission when schema access permission already granted", () => {
    const graph = createGraph(
      DataPermissionValue.UNRESTRICTED,
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
    );
    const updatedGraph = updateNativePermission(
      graph,
      groupId,
      entityId,
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      database,
      DataPermission.CREATE_QUERIES,
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        },
      },
    });
  });

  it.each([
    createGraph(DataPermissionValue.BLOCKED),
    createGraph(DataPermissionValue.NO),
    createGraph({ [schema]: DataPermissionValue.UNRESTRICTED }),
    createGraph({ [schema]: { [tableId]: DataPermissionValue.UNRESTRICTED } }),
    createGraph({ [schema]: { [tableId]: DataPermissionValue.SANDBOXED } }),
  ])(
    "should upgrade data access permission if it is not fully granted except impersonated",
    graph => {
      const updatedGraph = updateNativePermission(
        graph,
        groupId,
        entityId,
        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        database,
        DataPermission.CREATE_QUERIES,
      );

      expect(updatedGraph).toStrictEqual({
        [groupId]: {
          [databaseId]: {
            [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
            [DataPermission.CREATE_QUERIES]:
              DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
          },
        },
      });
    },
  );

  it("should not upgrade data access permission if it is impersonated", () => {
    const graph = createGraph(DataPermissionValue.IMPERSONATED);
    const updatedGraph = updateNativePermission(
      graph,
      groupId,
      entityId,
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
      database,
      DataPermission.CREATE_QUERIES,
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: {
          [DataPermission.VIEW_DATA]: DataPermissionValue.IMPERSONATED,
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        },
      },
    });
  });
});
