import type { DatabaseId, TableId } from "metabase-types/api";

import {
  type NodeSelection,
  getSchemaChildrenTableIds,
  getSchemaId,
  isItemSelected,
  noManuallySelectedDatabaseChildrenTables,
} from "./bulk-selection.utils";
import type { DatabaseNode, SchemaNode, TableNode } from "./types";

describe("bulk-selection.utils", () => {
  const createMockTableNode = (
    databaseId: DatabaseId,
    schemaName: string,
    tableId: TableId,
  ): TableNode => ({
    type: "table",
    label: `Table ${tableId}`,
    key: `db-${databaseId}-schema-${schemaName}-table-${tableId}`,
    value: { databaseId, schemaName, tableId },
    children: [],
  });

  const createMockSchemaNode = (
    databaseId: DatabaseId,
    schemaName: string,
    tables: TableNode[] = [],
  ): SchemaNode => ({
    type: "schema",
    label: schemaName,
    key: `db-${databaseId}-schema-${schemaName}`,
    value: { databaseId, schemaName },
    children: tables,
  });

  const createMockDatabaseNode = (
    databaseId: DatabaseId,
    schemas: SchemaNode[] = [],
  ): DatabaseNode => ({
    type: "database",
    label: `Database ${databaseId}`,
    key: `db-${databaseId}`,
    value: { databaseId },
    children: schemas,
  });

  describe("isItemSelected", () => {
    describe("table selection", () => {
      it("should return 'all' when table is selected", () => {
        const table = createMockTableNode(1, "public", 101);
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(table, selection)).toBe("all");
      });

      it("should return 'none' when table is not selected", () => {
        const table = createMockTableNode(1, "public", 101);
        const selection: NodeSelection = {
          tables: new Set([102]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(table, selection)).toBe("none");
      });
    });

    describe("schema selection", () => {
      it("should return 'all' when schema is directly selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(["1:public"]),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("all");
      });

      it("should return 'all' when all tables in schema are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set([101, 102]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("all");
      });

      it("should return 'some' when only some tables in schema are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("some");
      });

      it("should return 'none' when no tables in schema are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("none");
      });

      it("should return 'none' when schema has no children", () => {
        const schema = createMockSchemaNode(1, "public", []);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("none");
      });
    });

    describe("database selection", () => {
      it("should return 'all' when database is directly selected", () => {
        const schema = createMockSchemaNode(1, "public", []);
        const database = createMockDatabaseNode(1, [schema]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set([1]),
        };

        expect(isItemSelected(database, selection)).toBe("all");
      });

      it("should return 'all' when all schemas in database are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const table3 = createMockTableNode(1, "private", 103);
        const schema1 = createMockSchemaNode(1, "public", [table1, table2]);
        const schema2 = createMockSchemaNode(1, "private", [table3]);
        const database = createMockDatabaseNode(1, [schema1, schema2]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(["1:public", "1:private"]),
          databases: new Set(),
        };

        expect(isItemSelected(database, selection)).toBe("all");
      });

      it("should return 'all' when all tables in all schemas are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const table3 = createMockTableNode(1, "private", 103);
        const schema1 = createMockSchemaNode(1, "public", [table1, table2]);
        const schema2 = createMockSchemaNode(1, "private", [table3]);
        const database = createMockDatabaseNode(1, [schema1, schema2]);
        const selection: NodeSelection = {
          tables: new Set([101, 102, 103]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(database, selection)).toBe("all");
      });

      it("should return 'some' when only some schemas are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "private", 102);
        const schema1 = createMockSchemaNode(1, "public", [table1]);
        const schema2 = createMockSchemaNode(1, "private", [table2]);
        const database = createMockDatabaseNode(1, [schema1, schema2]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(["1:public"]),
          databases: new Set(),
        };

        expect(isItemSelected(database, selection)).toBe("some");
      });

      it("should return 'some' when only some tables are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const database = createMockDatabaseNode(1, [schema]);
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(database, selection)).toBe("some");
      });

      it("should return 'none' when database has no children", () => {
        const database = createMockDatabaseNode(1, []);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(database, selection)).toBe("none");
      });
    });
  });

  describe("getSchemaId", () => {
    it("should return schema ID for schema node", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema = createMockSchemaNode(1, "public", [table1]);

      expect(getSchemaId(schema)).toBe("1:public");
    });

    it("should return schema ID for schema node with no children", () => {
      const schema = createMockSchemaNode(1, "public", []);

      expect(getSchemaId(schema)).toBe("1:public");
    });
  });

  describe("getSchemaChildrenTableIds", () => {
    it("should return table IDs from schema children", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);

      const tableIds = getSchemaChildrenTableIds(schema);

      expect(tableIds).toEqual([101, 102]);
    });

    it("should return empty array when schema has no children", () => {
      const schema = createMockSchemaNode(1, "public", []);

      const tableIds = getSchemaChildrenTableIds(schema);

      expect(tableIds).toEqual([]);
    });
  });

  describe("noManuallySelectedDatabaseChildrenTables", () => {
    it("should return true when no tables in database schemas are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const selectedTables = new Set<TableId>();

      const result = noManuallySelectedDatabaseChildrenTables(
        database,
        selectedTables,
      );

      expect(result).toBe(true);
    });

    it("should return false when some tables in database schemas are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const selectedTables = new Set([101]);

      const result = noManuallySelectedDatabaseChildrenTables(
        database,
        selectedTables,
      );

      expect(result).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("selecting a database selects all schemas and tables in it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "private", 103);
      const schema1 = createMockSchemaNode(1, "public", [table1, table2]);
      const schema2 = createMockSchemaNode(1, "private", [table3]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set([1]),
      };

      expect(isItemSelected(database, selection)).toBe("all");
    });

    it("selecting a schema selects all tables in it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(["1:public"]),
        databases: new Set(),
      };

      expect(isItemSelected(schema, selection)).toBe("all");
      expect(isItemSelected(table1, selection)).toBe("none");
      expect(isItemSelected(table2, selection)).toBe("none");
    });

    it("selecting all tables in a schema selects the schema", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const selection: NodeSelection = {
        tables: new Set([101, 102]),
        schemas: new Set(),
        databases: new Set(),
      };

      expect(isItemSelected(schema, selection)).toBe("all");
    });

    it("selecting all schemas in a database selects the database", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(["1:public", "1:private"]),
        databases: new Set(),
      };

      expect(isItemSelected(database, selection)).toBe("all");
    });

    it("selecting all tables in a database selects the database", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "private", 103);
      const schema1 = createMockSchemaNode(1, "public", [table1, table2]);
      const schema2 = createMockSchemaNode(1, "private", [table3]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const selection: NodeSelection = {
        tables: new Set([101, 102, 103]),
        schemas: new Set(),
        databases: new Set(),
      };

      expect(isItemSelected(database, selection)).toBe("all");
      expect(isItemSelected(schema1, selection)).toBe("all");
      expect(isItemSelected(schema2, selection)).toBe("all");
    });

    it("deselecting a database deselects all schemas and tables", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const database = createMockDatabaseNode(1, [schema1]);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };

      expect(isItemSelected(database, selection)).toBe("none");
      expect(isItemSelected(schema1, selection)).toBe("none");
      expect(isItemSelected(table1, selection)).toBe("none");
    });

    it("deselecting a schema deselects all tables in it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };

      expect(isItemSelected(schema, selection)).toBe("none");
      expect(isItemSelected(table1, selection)).toBe("none");
      expect(isItemSelected(table2, selection)).toBe("none");
    });

    it("deselecting one table in a schema changes schema to 'some'", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const selection: NodeSelection = {
        tables: new Set([101]),
        schemas: new Set(),
        databases: new Set(),
      };

      expect(isItemSelected(schema, selection)).toBe("some");
    });

    it("deselecting one schema in a database changes database to 'some'", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(["1:public"]),
        databases: new Set(),
      };

      expect(isItemSelected(database, selection)).toBe("some");
    });
  });
});
