import type { Row } from "@tanstack/react-table";

import type { DatabaseId, TableId } from "metabase-types/api";

import type { NodeSelection } from "../bulk-selection.utils";
import type {
  DatabaseNode,
  SchemaNode,
  TableNode,
  TablePickerTreeNode,
  TreeNode,
} from "../types";

import { changeCheckboxSelection } from "./TablePickerTreeTable";

describe("handleCheckboxToggle", () => {
  interface CheckboxRowParams {
    type: "database" | "schema" | "table";
    nodeKey: string;
    tableId?: TableId;
    databaseId?: DatabaseId;
    isDisabled?: boolean;
    depth?: number;
  }

  const createCheckboxRow = ({
    type,
    nodeKey,
    tableId,
    databaseId,
    isDisabled,
    depth = 0,
  }: CheckboxRowParams): Row<TablePickerTreeNode> =>
    ({
      depth,
      original: {
        type,
        nodeKey,
        tableId,
        databaseId,
        isDisabled,
      },
    }) as Row<TablePickerTreeNode>;

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

  describe("single selection", () => {
    describe("table selection", () => {
      it("should select a table when it is not selected", () => {
        const table = createMockTableNode(1, "public", 101);
        const row = createCheckboxRow({
          type: "table",
          nodeKey: table.key,
          tableId: 101,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[table.key, table]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set([101]));
        expect(result.selection.schemas).toEqual(new Set());
        expect(result.selection.databases).toEqual(new Set());
        expect(result.lastSelectedRowIndex).toBe(0);
      });

      it("should deselect a table when it is selected", () => {
        const table = createMockTableNode(1, "public", 101);
        const row = createCheckboxRow({
          type: "table",
          nodeKey: table.key,
          tableId: table.value.tableId,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set([table.value.tableId]),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[table.key, table]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set());
        expect(result.lastSelectedRowIndex).toBe(0);
      });
    });

    describe("schema selection", () => {
      it("should select all tables in a schema with children", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const row = createCheckboxRow({
          type: "schema",
          nodeKey: schema.key,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[schema.key, schema]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set([101, 102]));
        expect(result.selection.schemas).toEqual(new Set());
        expect(result.lastSelectedRowIndex).toBe(0);
      });

      it("should select empty schema without children", () => {
        const schema = createMockSchemaNode(1, "public", []);
        const row = createCheckboxRow({
          type: "schema",
          nodeKey: schema.key,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[schema.key, schema]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set());
        expect(result.selection.schemas).toEqual(new Set(["1:public"]));
        expect(result.lastSelectedRowIndex).toBe(0);
      });

      it("should deselect all tables in a schema when all are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "public", 102);
        const schema = createMockSchemaNode(1, "public", [table1, table2]);
        const row = createCheckboxRow({
          type: "schema",
          nodeKey: schema.key,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set([table1.value.tableId, table2.value.tableId]),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[schema.key, schema]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set());
        expect(result.selection.schemas).toEqual(new Set());
        expect(result.lastSelectedRowIndex).toBe(0);
      });
    });

    describe("database selection", () => {
      it("should select all schemas and tables in a database with children", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const table2 = createMockTableNode(1, "private", 102);
        const schema1 = createMockSchemaNode(1, "public", [table1]);
        const schema2 = createMockSchemaNode(1, "private", [table2]);
        const database = createMockDatabaseNode(1, [schema1, schema2]);
        const row = createCheckboxRow({
          type: "database",
          nodeKey: database.key,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[database.key, database]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set([101, 102]));
        expect(result.selection.schemas).toEqual(new Set());
        expect(result.lastSelectedRowIndex).toBe(0);
      });

      it("should select empty database without children", () => {
        const database = createMockDatabaseNode(1, []);
        const row = createCheckboxRow({
          type: "database",
          nodeKey: database.key,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[database.key, database]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set());
        expect(result.selection.schemas).toEqual(new Set());
        expect(result.selection.databases).toEqual(new Set([1]));
        expect(result.lastSelectedRowIndex).toBe(0);
      });

      it("should deselect database when all children are selected", () => {
        const table1 = createMockTableNode(1, "public", 101);
        const schema1 = createMockSchemaNode(1, "public", [table1]);
        const database = createMockDatabaseNode(1, [schema1]);
        const row = createCheckboxRow({
          type: "database",
          nodeKey: database.key,
          databaseId: 1,
        });
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[database.key, database]]);

        const result = changeCheckboxSelection({
          row,
          index: 0,
          isShiftPressed: false,
          selection,
          lastSelectedRowIndex: null,
          rows: [row],
          nodeKeyToOriginal,
        });

        expect(result.selection.tables).toEqual(new Set());
        expect(result.selection.schemas).toEqual(new Set());
        expect(result.lastSelectedRowIndex).toBe(0);
      });
    });
  });

  describe("shift+click range selection", () => {
    it("should select all tables in a range", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "public", 103);
      const row1 = createCheckboxRow({
        type: "table",
        nodeKey: table1.key,
        tableId: 101,
        databaseId: 1,
      });
      const row2 = createCheckboxRow({
        type: "table",
        nodeKey: table2.key,
        tableId: 102,
        databaseId: 1,
      });
      const row3 = createCheckboxRow({
        type: "table",
        nodeKey: table3.key,
        tableId: 103,
        databaseId: 1,
      });
      const rows = [row1, row2, row3];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [table1.key, table1],
        [table2.key, table2],
        [table3.key, table3],
      ]);

      const result = changeCheckboxSelection({
        row: row3,
        index: 2,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      expect(result.selection.tables).toEqual(new Set([101, 102, 103]));
      expect(result.lastSelectedRowIndex).toBe(2);
    });

    it("should select range backwards (from higher to lower index)", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "public", 103);
      const row1 = createCheckboxRow({
        type: "table",
        nodeKey: table1.key,
        tableId: 101,
        databaseId: 1,
      });
      const row2 = createCheckboxRow({
        type: "table",
        nodeKey: table2.key,
        tableId: 102,
        databaseId: 1,
      });
      const row3 = createCheckboxRow({
        type: "table",
        nodeKey: table3.key,
        tableId: 103,
        databaseId: 1,
      });
      const rows = [row1, row2, row3];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [table1.key, table1],
        [table2.key, table2],
        [table3.key, table3],
      ]);

      const result = changeCheckboxSelection({
        row: row1,
        index: 0,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 2,
        rows,
        nodeKeyToOriginal,
      });

      expect(result.selection.tables).toEqual(new Set([101, 102, 103]));
      expect(result.lastSelectedRowIndex).toBe(0);
    });

    it("should skip disabled rows in range selection", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const table3 = createMockTableNode(1, "public", 103);
      const row1 = createCheckboxRow({
        type: "table",
        nodeKey: table1.key,
        tableId: 101,
        databaseId: 1,
      });
      const row2 = createCheckboxRow({
        type: "table",
        nodeKey: table2.key,
        tableId: 102,
        databaseId: 1,
        isDisabled: true,
      });
      const row3 = createCheckboxRow({
        type: "table",
        nodeKey: table3.key,
        tableId: 103,
        databaseId: 1,
      });
      const rows = [row1, row2, row3];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [table1.key, table1],
        [table2.key, table2],
        [table3.key, table3],
      ]);

      const result = changeCheckboxSelection({
        row: row3,
        index: 2,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      expect(result.selection.tables).toEqual(new Set([101, 103])); // 102 is skipped
      expect(result.lastSelectedRowIndex).toBe(2);
    });

    it("should include schema when it is the last row in range", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);
      const table3 = createMockTableNode(1, "public", 103);
      const row1 = createCheckboxRow({
        type: "table",
        nodeKey: table3.key,
        tableId: 103,
        databaseId: 1,
      });
      const row2 = createCheckboxRow({
        type: "schema",
        nodeKey: schema.key,
        databaseId: 1,
      });
      const rows = [row1, row2];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map<string, TreeNode>([
        [table3.key, table3],
        [schema.key, schema],
      ]);

      const result = changeCheckboxSelection({
        row: row2,
        index: 1,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // Schema is the last item, so all it's children should be included
      expect(result.selection.tables).toEqual(new Set([103, 101, 102]));
      expect(result.lastSelectedRowIndex).toBe(1);
    });

    it("should skip last expanded database when it has children after it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const schema2 = createMockSchemaNode(1, "public", [table2]);
      const database = createMockDatabaseNode(1, [schema1, schema2]);

      const row1 = createCheckboxRow({
        type: "database",
        nodeKey: database.key,
        databaseId: 1,
        depth: 0,
      });
      const row2 = createCheckboxRow({
        type: "schema",
        nodeKey: schema1.key,
        databaseId: 1,
        depth: 1,
      });
      const row3 = createCheckboxRow({
        type: "table",
        nodeKey: table2.key,
        tableId: 102,
        databaseId: 1,
        depth: 2,
      });
      const row4 = createCheckboxRow({
        type: "schema",
        nodeKey: schema2.key,
        databaseId: 1,
        depth: 1,
      });
      const rows = [row1, row2, row3, row4];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map<string, TreeNode>([
        [database.key, database],
        [table2.key, table2],
      ]);

      const result = changeCheckboxSelection({
        row: row3,
        index: 2,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // The database itself should NOT be added because it's the last in range
      // and has children after it (table2), so only table2 should be selected
      // schema 2 and it's children should not be added
      expect(result.selection.tables).toEqual(new Set([102]));
      expect(result.selection.schemas).toEqual(new Set());
      expect(result.selection.databases).toEqual(new Set());
      expect(result.lastSelectedRowIndex).toBe(2);
    });

    it("should skip last expanded schema when it has children after it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const schema = createMockSchemaNode(1, "public", [table1, table2]);

      const row1 = createCheckboxRow({
        type: "schema",
        nodeKey: schema.key,
        databaseId: 1,
        depth: 0,
      });
      const row2 = createCheckboxRow({
        type: "table",
        nodeKey: table1.key,
        tableId: 101,
        databaseId: 1,
        depth: 1,
      });
      const row3 = createCheckboxRow({
        type: "table",
        nodeKey: table2.key,
        tableId: 102,
        databaseId: 1,
        depth: 1,
      });
      const rows = [row1, row2, row3];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map<string, TreeNode>([
        [schema.key, schema],
        [table1.key, table1],
        [table2.key, table2],
      ]);

      const result = changeCheckboxSelection({
        row: row2,
        index: 1,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // The schema itself should NOT be added because it's the last in range
      // and has children after it (table2), so only table2 should be selected
      expect(result.selection.tables).toEqual(new Set([101]));
      expect(result.selection.schemas).toEqual(new Set());
      expect(result.lastSelectedRowIndex).toBe(1);
    });

    it("should include database when it is the last row in range", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const database = createMockDatabaseNode(1, [schema1]);

      const row1 = createCheckboxRow({
        type: "table",
        nodeKey: table1.key,
        tableId: 101,
        databaseId: 1,
      });
      const row2 = createCheckboxRow({
        type: "database",
        nodeKey: database.key,
        databaseId: 1,
      });
      const rows = [row1, row2];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map<string, TreeNode>([
        [table1.key, table1],
        [database.key, database],
      ]);

      const result = changeCheckboxSelection({
        row: row2,
        index: 1,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // Both table1 and the database's children should be selected
      expect(result.selection.tables).toEqual(new Set([101]));
      expect(result.lastSelectedRowIndex).toBe(1);
    });

    it("should select collapsed schema between expanded parents", () => {
      const eventsRaw = createMockTableNode(1, "raw", 101);
      const usersEvents = createMockTableNode(1, "raw", 102);
      const rawSchema = createMockSchemaNode(1, "raw", [
        eventsRaw,
        usersEvents,
      ]);

      // staging is collapsed (no children loaded)
      const stagingSchema = createMockSchemaNode(1, "staging", []);

      const orders = createMockTableNode(2, "public", 201);
      const sampleDbSchema = createMockSchemaNode(2, "public", [orders]);
      const sampleDatabase = createMockDatabaseNode(2, [sampleDbSchema]);

      const rowRaw = createCheckboxRow({
        type: "schema",
        nodeKey: rawSchema.key,
        databaseId: 1,
        depth: 0,
      });
      const rowEventsRaw = createCheckboxRow({
        type: "table",
        nodeKey: eventsRaw.key,
        tableId: 101,
        databaseId: 1,
        depth: 1,
      });
      const rowUsersEvents = createCheckboxRow({
        type: "table",
        nodeKey: usersEvents.key,
        tableId: 102,
        databaseId: 1,
        depth: 1,
      });
      const rowStaging = createCheckboxRow({
        type: "schema",
        nodeKey: stagingSchema.key,
        databaseId: 1,
        depth: 0,
      });
      const rowSampleDb = createCheckboxRow({
        type: "database",
        nodeKey: sampleDatabase.key,
        databaseId: 2,
        depth: 0,
      });
      const rowOrders = createCheckboxRow({
        type: "table",
        nodeKey: orders.key,
        tableId: 201,
        databaseId: 2,
        depth: 1,
      });

      const rows = [
        rowRaw,
        rowEventsRaw,
        rowUsersEvents,
        rowStaging,
        rowSampleDb,
        rowOrders,
      ];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map<string, TreeNode>([
        [rawSchema.key, rawSchema],
        [eventsRaw.key, eventsRaw],
        [usersEvents.key, usersEvents],
        [stagingSchema.key, stagingSchema],
        [sampleDatabase.key, sampleDatabase],
        [orders.key, orders],
      ]);

      // Click on raw (index 0), shift+click on Orders (index 5)
      const result = changeCheckboxSelection({
        row: rowOrders,
        index: 5,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // staging should be selected by ID since it's collapsed (no children in range)
      // raw should be skipped since its children (eventsRaw, usersEvents) are in range
      // sampleDatabase should be skipped since its child (orders) is in range
      expect(result.selection.tables).toEqual(new Set([101, 102, 201]));
      expect(result.selection.schemas).toEqual(new Set(["1:staging"]));
      expect(result.selection.databases).toEqual(new Set());
      expect(result.lastSelectedRowIndex).toBe(5);
    });
  });
});
