import type { DatabaseId, TableId } from "metabase-types/api";

import type { NodeSelection } from "../bulk-selection.utils";
import type { DatabaseNode, SchemaNode, TableNode } from "../types";

import {
  type CheckboxToggleRow,
  handleCheckboxToggleUtil as handleCheckboxToggle,
} from "./TablePickerTreeTable";

describe("handleCheckboxToggle", () => {
  const createCheckboxRow = (
    type: "database" | "schema" | "table",
    nodeKey: string,
    tableId?: TableId,
    databaseId?: DatabaseId,
    isDisabled?: boolean,
  ): CheckboxToggleRow => ({
    original: {
      type,
      nodeKey,
      tableId,
      databaseId,
      isDisabled,
    },
  });

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
        const row = createCheckboxRow("table", table.key, 101, 1);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[table.key, table]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("table", table.key, 101, 1);
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[table.key, table]]);

        const result = handleCheckboxToggle({
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

      it("should handle table with null tableId", () => {
        const table = createMockTableNode(1, "public", 101);
        const row = createCheckboxRow("table", table.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[table.key, table]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("schema", schema.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[schema.key, schema]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("schema", schema.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[schema.key, schema]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("schema", schema.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set([101, 102]),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[schema.key, schema]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("database", database.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[database.key, database]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("database", database.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set(),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[database.key, database]]);

        const result = handleCheckboxToggle({
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
        const row = createCheckboxRow("database", database.key, undefined, 1);
        const selection: NodeSelection = {
          tables: new Set([101]),
          schemas: new Set(),
          databases: new Set(),
        };
        const nodeKeyToOriginal = new Map([[database.key, database]]);

        const result = handleCheckboxToggle({
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
      const row1 = createCheckboxRow("table", table1.key, 101, 1);
      const row2 = createCheckboxRow("table", table2.key, 102, 1);
      const row3 = createCheckboxRow("table", table3.key, 103, 1);
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

      const result = handleCheckboxToggle({
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
      const row1 = createCheckboxRow("table", table1.key, 101, 1);
      const row2 = createCheckboxRow("table", table2.key, 102, 1);
      const row3 = createCheckboxRow("table", table3.key, 103, 1);
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

      const result = handleCheckboxToggle({
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
      const row1 = createCheckboxRow("table", table1.key, 101, 1, false);
      const row2 = createCheckboxRow("table", table2.key, 102, 1, true); // disabled
      const row3 = createCheckboxRow("table", table3.key, 103, 1, false);
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

      const result = handleCheckboxToggle({
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
      const row1 = createCheckboxRow("table", table3.key, 103, 1);
      const row2 = createCheckboxRow("schema", schema.key, undefined, 1);
      const rows = [row1, row2];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [table3.key, table3],
        [schema.key, schema],
      ]);

      const result = handleCheckboxToggle({
        row: row2,
        index: 1,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // Schema is the last item, so it should be included along with table3
      expect(result.selection.tables).toEqual(new Set([103, 101, 102]));
      expect(result.lastSelectedRowIndex).toBe(1);
    });

    it("should skip last expanded database when it has children after it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const database = createMockDatabaseNode(1, [schema1]);
      const table2 = createMockTableNode(1, "public", 102);

      const row1 = createCheckboxRow("database", database.key, undefined, 1);
      const row2 = createCheckboxRow("table", table2.key, 102, 1);
      const rows = [row1, row2];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [database.key, database],
        [table2.key, table2],
      ]);

      const result = handleCheckboxToggle({
        row: row2,
        index: 1,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: 0,
        rows,
        nodeKeyToOriginal,
      });

      // The database itself should NOT be added because it's the last in range
      // and has children after it (table2), so only table2 should be selected
      expect(result.selection.tables).toEqual(new Set([102]));
      expect(result.selection.databases).toEqual(new Set());
      expect(result.lastSelectedRowIndex).toBe(1);
    });

    it("should skip last expanded schema when it has children after it", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema = createMockSchemaNode(1, "public", [table1]);
      const table2 = createMockTableNode(1, "public", 102);

      const row1 = createCheckboxRow("schema", schema.key, undefined, 1);
      const row2 = createCheckboxRow("table", table2.key, 102, 1);
      const rows = [row1, row2];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [schema.key, schema],
        [table2.key, table2],
      ]);

      const result = handleCheckboxToggle({
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
      expect(result.selection.tables).toEqual(new Set([102]));
      expect(result.selection.schemas).toEqual(new Set());
      expect(result.lastSelectedRowIndex).toBe(1);
    });

    it("should include database when it is the last row in range", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const schema1 = createMockSchemaNode(1, "public", [table1]);
      const database = createMockDatabaseNode(1, [schema1]);

      const row1 = createCheckboxRow("table", table1.key, 101, 1);
      const row2 = createCheckboxRow("database", database.key, undefined, 1);
      const rows = [row1, row2];
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([
        [table1.key, table1],
        [database.key, database],
      ]);

      const result = handleCheckboxToggle({
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

    it("should handle shift+click with null lastSelectedRowIndex as single selection", () => {
      const table = createMockTableNode(1, "public", 101);
      const row = createCheckboxRow("table", table.key, 101, 1);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map([[table.key, table]]);

      const result = handleCheckboxToggle({
        row,
        index: 0,
        isShiftPressed: true,
        selection,
        lastSelectedRowIndex: null,
        rows: [row],
        nodeKeyToOriginal,
      });

      expect(result.selection.tables).toEqual(new Set([101]));
      expect(result.lastSelectedRowIndex).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle missing node in nodeKeyToOriginal map for schema", () => {
      const row = createCheckboxRow("schema", "unknown-key", undefined, 1);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map();

      const result = handleCheckboxToggle({
        row,
        index: 0,
        isShiftPressed: false,
        selection,
        lastSelectedRowIndex: null,
        rows: [row],
        nodeKeyToOriginal,
      });

      expect(result.selection).toEqual(selection);
      expect(result.lastSelectedRowIndex).toBe(0);
    });

    it("should handle missing node in nodeKeyToOriginal map for database", () => {
      const row = createCheckboxRow("database", "unknown-key", undefined, 1);
      const selection: NodeSelection = {
        tables: new Set(),
        schemas: new Set(),
        databases: new Set(),
      };
      const nodeKeyToOriginal = new Map();

      const result = handleCheckboxToggle({
        row,
        index: 0,
        isShiftPressed: false,
        selection,
        lastSelectedRowIndex: null,
        rows: [row],
        nodeKeyToOriginal,
      });

      expect(result.selection).toEqual(selection);
      expect(result.lastSelectedRowIndex).toBe(0);
    });

    it("should preserve existing selections when toggling new items", () => {
      const table1 = createMockTableNode(1, "public", 101);
      const table2 = createMockTableNode(1, "public", 102);
      const row = createCheckboxRow("table", table2.key, 102, 1);
      const selection: NodeSelection = {
        tables: new Set([101]),
        schemas: new Set(["1:private"]),
        databases: new Set([2]),
      };
      const nodeKeyToOriginal = new Map([
        [table1.key, table1],
        [table2.key, table2],
      ]);

      const result = handleCheckboxToggle({
        row,
        index: 0,
        isShiftPressed: false,
        selection,
        lastSelectedRowIndex: null,
        rows: [row],
        nodeKeyToOriginal,
      });

      expect(result.selection.tables).toEqual(new Set([101, 102]));
      expect(result.selection.schemas).toEqual(new Set(["1:private"]));
      expect(result.selection.databases).toEqual(new Set([2]));
    });
  });
});
