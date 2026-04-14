import { buildPermissionsGraph } from "./permission-utils";

describe("buildPermissionsGraph", () => {
  const groupId = 10;

  it("sets view-data to 'impersonated' for database impersonation", () => {
    const result = buildPermissionsGraph(groupId, {
      impersonatedDatabaseIds: [1, 2],
    });

    expect(result).toEqual({
      [groupId]: {
        1: { "view-data": "impersonated", "create-queries": "query-builder" },
        2: { "view-data": "impersonated", "create-queries": "query-builder" },
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
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("blocks schemas without selected tables when allSchemaTables is provided", () => {
    const result = buildPermissionsGraph(
      groupId,
      {
        sandboxedTables: [
          {
            tableId: 100,
            databaseId: 1,
            schemaName: "tenant_data",
            filterFieldId: 5,
          },
        ],
      },
      {
        1: {
          tenant_data: [100, 101],
          internal: [200, 201],
          analytics: [300],
        },
      },
    );

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            tenant_data: { 100: "sandboxed", 101: "blocked" },
            internal: "blocked",
            analytics: "blocked",
          },
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("blocks non-selected tables within schemas that have sandboxed tables", () => {
    const result = buildPermissionsGraph(
      groupId,
      {
        sandboxedTables: [
          {
            tableId: 100,
            databaseId: 1,
            schemaName: "public",
            filterFieldId: 5,
          },
        ],
      },
      { 1: { public: [100, 101, 102] } },
    );

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            public: { 100: "sandboxed", 101: "blocked", 102: "blocked" },
          },
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("handles multiple databases with allSchemaTables", () => {
    const result = buildPermissionsGraph(
      groupId,
      {
        sandboxedTables: [
          {
            tableId: 100,
            databaseId: 1,
            schemaName: "public",
            filterFieldId: 5,
          },
          {
            tableId: 200,
            databaseId: 2,
            schemaName: "data",
            filterFieldId: 6,
          },
        ],
      },
      {
        1: { public: [100, 101], private: [150] },
        2: { data: [200, 201], logs: [300], archive: [400] },
      },
    );

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            public: { 100: "sandboxed", 101: "blocked" },
            private: "blocked",
          },
          "create-queries": "query-builder",
        },
        2: {
          "view-data": {
            data: { 200: "sandboxed", 201: "blocked" },
            logs: "blocked",
            archive: "blocked",
          },
          "create-queries": "query-builder",
        },
      },
    });
  });
});
