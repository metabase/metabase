import { buildPermissionsGraph } from "./permission-utils";

describe("buildPermissionsGraph", () => {
  const groupId = 10;

  it("sets view-data to 'impersonated' for database impersonation", () => {
    const result = buildPermissionsGraph(groupId, {
      impersonatedDatabaseIds: [1, 2],
    });

    expect(result).toEqual({
      [groupId]: {
        1: { "view-data": "impersonated" },
        2: { "view-data": "impersonated" },
      },
    });
  });

  it("sets view-data to 'sandboxed' for table sandboxing, grouped by schema", () => {
    const result = buildPermissionsGraph(groupId, {
      sandboxedTables: [
        { tableId: 100, databaseId: 1, schemaName: "public", filterFieldId: 5 },
        { tableId: 101, databaseId: 1, schemaName: "public", filterFieldId: 6 },
        {
          tableId: 200,
          databaseId: 1,
          schemaName: "private",
          filterFieldId: 7,
        },
      ],
    });

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            public: { 100: "sandboxed", 101: "sandboxed" },
            private: { 200: "sandboxed" },
          },
        },
      },
    });
  });
});
