import type { DatabaseId, TableId } from "metabase-types/api";

import {
  type NodeSelection,
  areSchemasSelected,
  areTablesSelected,
  getChildSchemas,
  getParentSchema,
  getParentSchemaTables,
  getSchemaChildrenTableIds,
  getSchemaId,
  getSchemaTableIds,
  getSchemaTables,
  getSchemas,
  isItemSelected,
  isParentSchemaSelected,
  noManuallySelectedDatabaseChildrenTables,
  noManuallySelectedSchemas,
  noManuallySelectedTables,
} from "./bulk-selection.utils";
import type { DatabaseNode, FlatItem, SchemaNode, TableNode } from "./types";

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

  const createMockFlatItem = (
    node: TableNode | SchemaNode | DatabaseNode,
    parent?: string,
    level: number = 0,
  ): FlatItem =>
    ({
      type: node.type,
      label: node.label,
      key: node.key,
      value: node.value,
      children: node.children,
      level,
      parent,
      isExpanded: false,
    }) as FlatItem;

  describe("isItemSelected", () => {
    describe("table selection", () => {
      it("should return 'yes' when table is selected", () => {
        const table = createMockTableNode(1, "public", 101);
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(table, selection)).toBe("yes");
      });

      it("should return 'no' when table is not selected", () => {
        const table = createMockTableNode(1, "public", 101);
        const selection: NodeSelection = {
          tables: new Set([102]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(table, selection)).toBe("no");
      });
    });

    describe("schema selection", () => {
      it("should return 'yes' when schema is directly selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(["1:public"]),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("yes");
      });

      it("should return 'yes' when all tables in schema are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set([101, 102]),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("yes");
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

      it("should return 'no' when no tables in schema are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("no");
      });

      it("should return 'no' when schema has no children", () => {
        const schema = createMockSchemaNode(1, "public", []);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(schema, selection)).toBe("no");
      });
    });

    describe("database selection", () => {
      it("should return 'yes' when database is directly selected", () => {
        const schema = createMockSchemaNode(1, "public", []);
        const database = createMockDatabaseNode(1, [schema]);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set([1]),
        };

        expect(isItemSelected(database, selection)).toBe("yes");
      });

      it("should return 'yes' when all schemas in database are selected", () => {
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

        expect(isItemSelected(database, selection)).toBe("yes");
      });

      it("should return 'yes' when all tables in all schemas are selected", () => {
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

        expect(isItemSelected(database, selection)).toBe("yes");
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

      it("should return 'no' when database has no children", () => {
        const database = createMockDatabaseNode(1, []);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };

        expect(isItemSelected(database, selection)).toBe("no");
      });
    });

    it("should return 'no' when selection is null/undefined", () => {
      const table = createMockTableNode(1, "public", 101);

      expect(isItemSelected(table, null as any)).toBe("no");
    });
  });

  describe("getSchemaId", () => {
    it("should return schema ID for table item", () => {
      const table = createMockTableNode(1, "public", 101);
      const flatItem = createMockFlatItem(table);

      expect(getSchemaId(flatItem)).toBe("1:public");
    });

    it("should return schema ID for schema item with table children", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema = createMockSchemaNode(1, "public", [table1]);
      const flatItem = createMockFlatItem(schema);

      expect(getSchemaId(flatItem)).toBe("1:public");
    });

    it("should return undefined for loading item", () => {
      const loadingItem: FlatItem = {
        isLoading: true,
        type: "table",
        key: "loading",
        level: 0,
        children: [],
      };

      expect(getSchemaId(loadingItem)).toBeUndefined();
    });

    it("should return undefined for database item", () => {
      const database = createMockDatabaseNode(1, []);
      const flatItem = createMockFlatItem(database);

      expect(getSchemaId(flatItem)).toBeUndefined();
    });

    it("should return schema ID for schema item with no children", () => {
      const schema = createMockSchemaNode(1, "public", []);
      const flatItem = createMockFlatItem(schema);

      expect(getSchemaId(flatItem)).toBe("1:public");
    });
  });

  describe("isParentSchemaSelected", () => {
    it("should return true when parent schema is selected", () => {
      const table = createMockTableNode(1, "public", 101);
      const flatItem = createMockFlatItem(table);
      const selectedSchemas = new Set(["1:public"]);

      expect(isParentSchemaSelected(flatItem, selectedSchemas)).toBe(true);
    });

    it("should return false when parent schema is not selected", () => {
      const table = createMockTableNode(1, "public", 101);
      const flatItem = createMockFlatItem(table);
      const selectedSchemas = new Set(["1:private"]);

      expect(isParentSchemaSelected(flatItem, selectedSchemas)).toBe(false);
    });

    it("should return false for non-table items", () => {
      const schema = createMockSchemaNode(1, "public", []);
      const flatItem = createMockFlatItem(schema);
      const selectedSchemas = new Set(["1:public"]);

      expect(isParentSchemaSelected(flatItem, selectedSchemas)).toBe(false);
    });
  });

  describe("getSchemaTables", () => {
    it("should return all tables in a schema", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "private", 103);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const allItems = [table1, table2, table3];

      const tables = getSchemaTables(createMockFlatItem(schema), allItems);

      expect(tables).toHaveLength(2);
      expect(tables.map((t) => t.value.tableId)).toEqual([101, 102]);
    });

    it("should return empty array when no tables match schema", () => {
      const table = createMockTableNode(1, "private", 101);
      const schema = createMockSchemaNode(1, "public", []);
      const allItems = [table];

      const tables = getSchemaTables(createMockFlatItem(schema), allItems);

      expect(tables).toHaveLength(0);
    });
  });

  describe("getSchemaTableIds", () => {
    it("should return table IDs for all tables in a schema", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const flatItems = [
        createMockFlatItem(table1),
        createMockFlatItem(table2),
        createMockFlatItem(schema),
      ];

      const tableIds = getSchemaTableIds(createMockFlatItem(schema), flatItems);

      expect(tableIds).toEqual([101, 102]);
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

  describe("getParentSchema", () => {
    it("should find parent schema for a table", () => {
      const table = createMockTableNode(1, "public", 101);
      const schema = createMockSchemaNode(1, "public", [table]);
      const flatItems = [createMockFlatItem(table), createMockFlatItem(schema)];

      const parentSchema = getParentSchema(
        createMockFlatItem(table),
        flatItems,
      );

      expect(parentSchema).toBeDefined();
      expect(parentSchema?.type).toBe("schema");
      expect((parentSchema?.value as any).schemaName).toBe("public");
    });

    it("should return undefined when parent schema not found", () => {
      const table = createMockTableNode(1, "public", 101);
      const schema = createMockSchemaNode(1, "private", []);
      const flatItems = [createMockFlatItem(table), createMockFlatItem(schema)];

      const parentSchema = getParentSchema(
        createMockFlatItem(table),
        flatItems,
      );

      expect(parentSchema).toBeUndefined();
    });
  });

  describe("getParentSchemaTables", () => {
    it("should return all tables in the same schema as the given table", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "private", 103);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const flatItems = [
        createMockFlatItem(table1),
        createMockFlatItem(table2),
        createMockFlatItem(table3),
        createMockFlatItem(schema),
      ];

      const tables = getParentSchemaTables(
        createMockFlatItem(table1),
        flatItems,
      );

      expect(tables).toHaveLength(2);
      expect(tables.map((t) => (t.value as any).tableId)).toEqual([101, 102]);
    });

    it("should return empty array when parent schema not found", () => {
      const table = createMockTableNode(1, "public", 101);
      const flatItems = [createMockFlatItem(table)];

      const tables = getParentSchemaTables(
        createMockFlatItem(table),
        flatItems,
      );

      expect(tables).toEqual([]);
    });
  });

  describe("areTablesSelected", () => {
    it("should return 'all' when all tables are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const allItems = [table1, table2];
      const selectedItems = new Set([101, 102]);

      const result = areTablesSelected(
        createMockFlatItem(schema),
        allItems,
        selectedItems,
      );

      expect(result).toBe("all");
    });

    it("should return 'some' when some tables are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const allItems = [table1, table2];
      const selectedItems = new Set([101]);

      const result = areTablesSelected(
        createMockFlatItem(schema),
        allItems,
        selectedItems,
      );

      expect(result).toBe("some");
    });

    it("should return 'none' when no tables are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const allItems = [table1, table2];
      const selectedItems = new Set<TableId>();

      const result = areTablesSelected(
        createMockFlatItem(schema),
        allItems,
        selectedItems,
      );

      expect(result).toBe("none");
    });

    it("should return 'none' when schema has no tables", () => {
      const schema = createMockSchemaNode(1, "public", []);
      const allItems: any[] = [];
      const selectedItems = new Set([101]);

      const result = areTablesSelected(
        createMockFlatItem(schema),
        allItems,
        selectedItems,
      );

      expect(result).toBe("none");
    });
  });

  describe("getSchemas", () => {
    it("should return all schemas in a database", () => {
      const database = createMockDatabaseNode(1, []);
      const schema1 = createMockSchemaNode(1, "public", []);
      const schema2 = createMockSchemaNode(1, "private", []);
      const schema3 = createMockSchemaNode(2, "public", []);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1),
        createMockFlatItem(schema2),
        createMockFlatItem(schema3),
      ];

      const schemas = getSchemas(createMockFlatItem(database), flatItems);

      expect(schemas).toHaveLength(2);
      expect(schemas.map((s) => (s.value as any).schemaName)).toEqual([
        "public",
        "private",
      ]);
    });
  });

  describe("getChildSchemas", () => {
    it("should return child schemas of a database", () => {
      const schema1 = createMockSchemaNode(1, "public", []);
      const schema2 = createMockSchemaNode(1, "private", []);
      const database = createMockDatabaseNode(1, [schema1, schema2]);

      const schemas = getChildSchemas(database);

      expect(schemas).toHaveLength(2);
      expect(schemas).toEqual([schema1, schema2]);
    });
  });

  describe("areSchemasSelected", () => {
    it("should return 'all' when all schemas are directly selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1),
        createMockFlatItem(schema2),
      ];
      const selectedSchemas = new Set(["1:public", "1:private"]);
      const selectedTables = new Set<TableId>();

      const result = areSchemasSelected(
        createMockFlatItem(database),
        flatItems,
        selectedSchemas,
        selectedTables,
      );

      expect(result).toBe("all");
    });

    it("should return 'all' when all tables in all schemas are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1),
        createMockFlatItem(schema2),
      ];
      const selectedSchemas = new Set<string>();
      const selectedTables = new Set([101, 102]);

      const result = areSchemasSelected(
        createMockFlatItem(database),
        flatItems,
        selectedSchemas,
        selectedTables,
      );

      expect(result).toBe("all");
    });

    it("should return 'some' when only some schemas are selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "private", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1),
        createMockFlatItem(schema2),
      ];
      const selectedSchemas = new Set(["1:public"]);
      const selectedTables = new Set<TableId>();

      const result = areSchemasSelected(
        createMockFlatItem(database),
        flatItems,
        selectedSchemas,
        selectedTables,
      );

      expect(result).toBe("some");
    });

    it("should return 'none' when no schemas are selected", () => {
      const schema1 = createMockSchemaNode(1, "public", []);
      const schema2 = createMockSchemaNode(1, "private", []);
      const database = createMockDatabaseNode(1, [schema1, schema2]);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1),
        createMockFlatItem(schema2),
      ];
      const selectedSchemas = new Set<string>();
      const selectedTables = new Set<TableId>();

      const result = areSchemasSelected(
        createMockFlatItem(database),
        flatItems,
        selectedSchemas,
        selectedTables,
      );

      expect(result).toBe("none");
    });

    it("should return 'none' for non-database item", () => {
      const schema = createMockSchemaNode(1, "public", []);
      const flatItems = [createMockFlatItem(schema)];
      const selectedSchemas = new Set<string>();
      const selectedTables = new Set<TableId>();

      const result = areSchemasSelected(
        createMockFlatItem(schema),
        flatItems,
        selectedSchemas,
        selectedTables,
      );

      expect(result).toBe("none");
    });
  });

  describe("noManuallySelectedTables", () => {
    it("should return true when no tables in schema are manually selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", []);
      const flatItems = [
        createMockFlatItem(schema),
        createMockFlatItem(table1, schema.key),
        createMockFlatItem(table2, schema.key),
      ];
      const selectedTables = new Set<TableId>();

      const result = noManuallySelectedTables(
        createMockFlatItem(schema),
        flatItems,
        selectedTables,
      );

      expect(result).toBe(true);
    });

    it("should return false when some tables in schema are manually selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", []);
      const flatItems = [
        createMockFlatItem(schema),
        createMockFlatItem(table1, schema.key),
        createMockFlatItem(table2, schema.key),
      ];
      const selectedTables = new Set([101]);

      const result = noManuallySelectedTables(
        createMockFlatItem(schema),
        flatItems,
        selectedTables,
      );

      expect(result).toBe(false);
    });

    it("should return false when schema is undefined", () => {
      const flatItems: FlatItem[] = [];
      const selectedTables = new Set<TableId>();

      const result = noManuallySelectedTables(
        undefined,
        flatItems,
        selectedTables,
      );

      expect(result).toBe(false);
    });
  });

  describe("noManuallySelectedSchemas", () => {
    it("should return true when no schemas in database are manually selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", []);
      const database = createMockDatabaseNode(1, []);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1, database.key),
        createMockFlatItem(schema2, database.key),
      ];
      const selectedSchemas = new Set<string>();

      const result = noManuallySelectedSchemas(
        database,
        flatItems,
        selectedSchemas,
      );

      expect(result).toBe(true);
    });

    it("should return false when some schemas in database are manually selected", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "private", []);
      const database = createMockDatabaseNode(1, []);
      const flatItems = [
        createMockFlatItem(database),
        createMockFlatItem(schema1, database.key),
        createMockFlatItem(schema2, database.key),
      ];
      const selectedSchemas = new Set(["1:public"]);

      const result = noManuallySelectedSchemas(
        database,
        flatItems,
        selectedSchemas,
      );

      expect(result).toBe(false);
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

      expect(isItemSelected(database, selection)).toBe("yes");
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

      expect(isItemSelected(schema, selection)).toBe("yes");
      expect(isItemSelected(table1, selection)).toBe("no");
      expect(isItemSelected(table2, selection)).toBe("no");
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

      expect(isItemSelected(schema, selection)).toBe("yes");
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

      expect(isItemSelected(database, selection)).toBe("yes");
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

      expect(isItemSelected(database, selection)).toBe("yes");
      expect(isItemSelected(schema1, selection)).toBe("yes");
      expect(isItemSelected(schema2, selection)).toBe("yes");
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

      expect(isItemSelected(database, selection)).toBe("no");
      expect(isItemSelected(schema1, selection)).toBe("no");
      expect(isItemSelected(table1, selection)).toBe("no");
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

      expect(isItemSelected(schema, selection)).toBe("no");
      expect(isItemSelected(table1, selection)).toBe("no");
      expect(isItemSelected(table2, selection)).toBe("no");
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
