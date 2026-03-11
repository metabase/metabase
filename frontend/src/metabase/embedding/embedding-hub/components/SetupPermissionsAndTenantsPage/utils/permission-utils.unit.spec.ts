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

  it("blocks schemas without selected tables when allDatabaseSchemas is provided", () => {
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
      { 1: ["tenant_data", "internal", "analytics"] },
    );

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            tenant_data: { 100: "sandboxed" },
            internal: "blocked",
            analytics: "blocked",
          },
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("handles multiple databases with allDatabaseSchemas", () => {
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
        1: ["public", "private"],
        2: ["data", "logs", "archive"],
      },
    );

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            public: { 100: "sandboxed" },
            private: "blocked",
          },
          "create-queries": "query-builder",
        },
        2: {
          "view-data": {
            data: { 200: "sandboxed" },
            logs: "blocked",
            archive: "blocked",
          },
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("does not block schemas when allDatabaseSchemas is not provided (backward compatible)", () => {
    const result = buildPermissionsGraph(groupId, {
      sandboxedTables: [
        {
          tableId: 100,
          databaseId: 1,
          schemaName: "public",
          filterFieldId: 5,
        },
      ],
    });

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            public: { 100: "sandboxed" },
          },
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("ignores allDatabaseSchemas entries for databases without sandboxed tables", () => {
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
      {
        1: ["public", "private"],
        // db 99 has schemas listed but no sandboxed tables — should be ignored
        99: ["schema_a", "schema_b"],
      },
    );

    expect(result).toEqual({
      [groupId]: {
        1: {
          "view-data": {
            public: { 100: "sandboxed" },
            private: "blocked",
          },
          "create-queries": "query-builder",
        },
      },
    });
  });
});
