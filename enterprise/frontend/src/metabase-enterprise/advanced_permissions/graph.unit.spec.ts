import { createMockDatabase } from "metabase-types/api/mocks";
import { DatabaseAccessPermissions } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";
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

const createGraph = (dataPermissions: DatabaseAccessPermissions) => ({
  [groupId]: {
    [databaseId]: { data: dataPermissions },
  },
});

describe("updateNativePermission", () => {
  it("should revoke native query permission and keep the schema access permission", () => {
    const graph = createGraph({ schemas: "all", native: "write" });
    const updatedGraph = updateNativePermission(
      graph,
      groupId,
      entityId,
      undefined,
      database,
      "data",
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: { data: { native: undefined, schemas: "all" } },
      },
    });
  });

  it("should grant native query permission when schema access permission already granted", () => {
    const graph = createGraph({ schemas: "all", native: "write" });
    const updatedGraph = updateNativePermission(
      graph,
      groupId,
      entityId,
      "write",
      database,
      "data",
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: { data: { native: "write", schemas: "all" } },
      },
    });
  });

  it.each([
    createGraph({ schemas: "block" }),
    createGraph({ schemas: "none" }),
    createGraph({ schemas: { [schema]: "all" } }),
    createGraph({
      schemas: { [schema]: { [tableId]: "all" } },
    }),
    createGraph({
      schemas: {
        [schema]: { [tableId]: { read: "all", query: "segmented" } },
      },
    }),
  ])(
    "should upgrade data access permission if it is not fully granted except impersonated",
    graph => {
      const updatedGraph = updateNativePermission(
        graph,
        groupId,
        entityId,
        "write",
        database,
        "data",
      );

      expect(updatedGraph).toStrictEqual({
        [groupId]: {
          [databaseId]: { data: { native: "write", schemas: "all" } },
        },
      });
    },
  );

  it("should not upgrade data access permission if it is impersonated", () => {
    const graph = createGraph({ schemas: "impersonated" });
    const updatedGraph = updateNativePermission(
      graph,
      groupId,
      entityId,
      "write",
      database,
      "data",
    );

    expect(updatedGraph).toStrictEqual({
      [groupId]: {
        [databaseId]: { data: { native: "write", schemas: "impersonated" } },
      },
    });
  });
});
