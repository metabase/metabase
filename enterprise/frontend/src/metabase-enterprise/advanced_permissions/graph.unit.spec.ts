import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/utils/types";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import {
  DataPermission,
  DataPermissionValue,
  type SchemasPermissions,
} from "metabase-types/api";
import { createMockDatabase, createMockSchema } from "metabase-types/api/mocks";

import { upgradeViewPermissionsIfNeeded } from "./graph";

const groupId = 10;
const databaseId = 20;
const schema = "my_schema";
const tableId = 30;
const entityId = { databaseId };

const schemaId = generateSchemaId(databaseId, schema);

const metadata = createMockMetadata({
  databases: [createMockDatabase({ id: databaseId, schemas: [schemaId] })],
  schemas: [createMockSchema({ id: schemaId, name: schema })],
});

const database = checkNotNull(metadata.database(databaseId));

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
