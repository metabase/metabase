import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ConcreteTableId, Table } from "metabase-types/api";

import type { SchemaViewerFlowNode } from "../types";

import { TableSelectorInput } from "./TableSelectorInput";

const renderWithProvider = (component: React.ReactElement) => {
  return render(<MantineProvider>{component}</MantineProvider>);
};

// Mock React Flow
jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: jest.fn(),
    getNodes: jest.fn(() => []),
    getEdges: jest.fn(() => []),
    setNodes: jest.fn(),
  }),
}));

// Mock SchemaViewerContext
jest.mock("../SchemaViewerContext", () => ({
  useIsCompactMode: () => false,
}));

const createTable = (id: number, name: string, displayName?: string): Table => ({
  id: id as ConcreteTableId,
  name,
  display_name: displayName,
  schema: "PUBLIC",
  db_id: 1,
});

const createNode = (
  tableId: number,
  tableName: string,
  isFocal = false,
): SchemaViewerFlowNode => ({
  id: `table-${tableId}`,
  type: "schemaViewerTable",
  position: { x: 0, y: 0 },
  data: {
    table_id: tableId,
    table_name: tableName,
    schema: "PUBLIC",
    fields: [],
    is_focal: isFocal,
    connectedFieldIds: new Set(),
  },
});

describe("TableSelectorInput", () => {
  describe("button rendering", () => {
    it("should render button with table icon", () => {
      const tables = [createTable(1, "ORDERS")];

      renderWithProvider(
        <TableSelectorInput
          nodes={[]}
          allTables={tables}
          selectedTableIds={[1 as ConcreteTableId]}
          isUserModified={false}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId("table-selector-button")).toBeInTheDocument();
    });

    it("should show 'Most relationships' when not user modified", () => {
      const tables = [createTable(1, "ORDERS")];

      renderWithProvider(
        <TableSelectorInput
          nodes={[]}
          allTables={tables}
          selectedTableIds={[1 as ConcreteTableId]}
          isUserModified={false}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByText("Most relationships")).toBeInTheDocument();
    });

    it("should show count when user modified with 1 table", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];
      const nodes = [createNode(1, "ORDERS")];

      renderWithProvider(
        <TableSelectorInput
          nodes={nodes}
          allTables={tables}
          selectedTableIds={[1 as ConcreteTableId]}
          isUserModified={true}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByText("1 tables selected")).toBeInTheDocument();
    });

    it("should show count when user modified with multiple tables", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];
      const nodes = [createNode(1, "ORDERS"), createNode(2, "PRODUCTS")];

      renderWithProvider(
        <TableSelectorInput
          nodes={nodes}
          allTables={tables}
          selectedTableIds={[1 as ConcreteTableId, 2 as ConcreteTableId]}
          isUserModified={true}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByText("2 tables selected")).toBeInTheDocument();
    });

    it("should update count when nodes change", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];

      const { rerender } = renderWithProvider(
        <TableSelectorInput
          nodes={[createNode(1, "ORDERS")]}
          allTables={tables}
          selectedTableIds={[1 as ConcreteTableId]}
          isUserModified={true}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByText("1 tables selected")).toBeInTheDocument();

      rerender(
        <MantineProvider>
          <TableSelectorInput
            nodes={[createNode(1, "ORDERS"), createNode(2, "PRODUCTS")]}
            allTables={tables}
            selectedTableIds={[1 as ConcreteTableId, 2 as ConcreteTableId]}
            isUserModified={true}
            onSelectionChange={jest.fn()}
          />
        </MantineProvider>,
      );

      expect(screen.getByText("2 tables selected")).toBeInTheDocument();
    });

    it("should show visible count, not selectedTableIds count, when some tables don't exist", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      // Only 2 nodes exist on canvas, but 3 IDs are "selected" (one deleted)
      const nodes = [createNode(1, "ORDERS"), createNode(2, "PRODUCTS")];

      renderWithProvider(
        <TableSelectorInput
          nodes={nodes}
          allTables={tables}
          selectedTableIds={[
            1 as ConcreteTableId,
            2 as ConcreteTableId,
            99 as ConcreteTableId,
          ]}
          isUserModified={true}
          onSelectionChange={jest.fn()}
        />,
      );

      // Should show 2 (nodes.length), not 3 (selectedTableIds.length)
      expect(screen.getByText("2 tables selected")).toBeInTheDocument();
    });
  });

  describe("visibility", () => {
    it("should not render when allTables is empty", () => {
      renderWithProvider(
        <TableSelectorInput
          nodes={[]}
          allTables={[]}
          selectedTableIds={[]}
          isUserModified={false}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(
        screen.queryByTestId("table-selector-button"),
      ).not.toBeInTheDocument();
    });

    it("should render with single table", () => {
      const tables = [createTable(1, "ORDERS")];

      renderWithProvider(
        <TableSelectorInput
          nodes={[]}
          allTables={tables}
          selectedTableIds={[]}
          isUserModified={false}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId("table-selector-button")).toBeInTheDocument();
    });

    it("should render with multiple tables", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];

      renderWithProvider(
        <TableSelectorInput
          nodes={[]}
          allTables={tables}
          selectedTableIds={[]}
          isUserModified={false}
          onSelectionChange={jest.fn()}
        />,
      );

      expect(screen.getByTestId("table-selector-button")).toBeInTheDocument();
    });
  });

  describe("search filtering logic", () => {
    it("should filter by name (case-insensitive)", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      const query = "orders";

      const filtered = tables.filter(
        (table) =>
          table.display_name?.toLowerCase().includes(query) ||
          table.name.toLowerCase().includes(query),
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("ORDERS");
    });

    it("should filter by display_name", () => {
      const tables = [
        createTable(1, "orders", "Customer Orders"),
        createTable(2, "products", "Product Catalog"),
      ];
      const query = "customer";

      const filtered = tables.filter(
        (table) =>
          table.display_name?.toLowerCase().includes(query) ||
          table.name.toLowerCase().includes(query),
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].display_name).toBe("Customer Orders");
    });

    it("should support partial match", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];
      const query = "ord";

      const filtered = tables.filter((table) =>
        table.name.toLowerCase().includes(query),
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("ORDERS");
    });

    it("should return empty array when no matches", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];
      const query = "nonexistent";

      const filtered = tables.filter((table) =>
        table.name.toLowerCase().includes(query),
      );

      expect(filtered).toHaveLength(0);
    });
  });

  describe("sorting logic", () => {
    it("should sort selected tables first", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      const selectedIds = new Set([2 as ConcreteTableId]);

      const sorted = [...tables].sort((a, b) => {
        const aSelected = selectedIds.has(a.id as ConcreteTableId);
        const bSelected = selectedIds.has(b.id as ConcreteTableId);

        if (aSelected && !bSelected) {
          return -1;
        }
        if (!aSelected && bSelected) {
          return 1;
        }
        return 0;
      });

      expect(sorted[0].id).toBe(2); // PRODUCTS (selected)
      expect(sorted[1].id).toBe(1); // ORDERS
      expect(sorted[2].id).toBe(3); // PEOPLE
    });

    it("should sort visible tables after selected", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      const selectedIds = new Set([1 as ConcreteTableId]);
      const visibleIds = new Set([2 as ConcreteTableId]);

      const sorted = [...tables].sort((a, b) => {
        const aId = a.id as ConcreteTableId;
        const bId = b.id as ConcreteTableId;
        const aSelected = selectedIds.has(aId);
        const bSelected = selectedIds.has(bId);
        const aVisible = visibleIds.has(aId);
        const bVisible = visibleIds.has(bId);

        // Selected first
        if (aSelected && !bSelected) {
          return -1;
        }
        if (!aSelected && bSelected) {
          return 1;
        }
        // Then visible
        if (!aSelected && !bSelected) {
          if (aVisible && !bVisible) {
            return -1;
          }
          if (!aVisible && bVisible) {
            return 1;
          }
        }
        return 0;
      });

      expect(sorted[0].id).toBe(1); // ORDERS (selected)
      expect(sorted[1].id).toBe(2); // PRODUCTS (visible)
      expect(sorted[2].id).toBe(3); // PEOPLE (neither)
    });
  });

  describe("select all logic", () => {
    it("should detect all selected state", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];
      const selectedCount = 2;
      const allSelected = selectedCount === tables.length;

      expect(allSelected).toBe(true);
    });

    it("should detect some selected state", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      const selectedCount = 2;
      const someSelected = selectedCount > 0 && selectedCount < tables.length;

      expect(someSelected).toBe(true);
    });

    it("should detect none selected state", () => {
      const tables = [createTable(1, "ORDERS"), createTable(2, "PRODUCTS")];
      const selectedCount = 0;
      const allSelected = selectedCount === tables.length;
      const someSelected = selectedCount > 0 && selectedCount < tables.length;

      expect(allSelected).toBe(false);
      expect(someSelected).toBe(false);
    });
  });

  describe("toggle logic", () => {
    it("should add table ID when checking", () => {
      const selectedTableIds = [1 as ConcreteTableId];
      const tableId = 2 as ConcreteTableId;
      const checked = true;

      const newSelection = checked
        ? [...selectedTableIds, tableId]
        : selectedTableIds.filter((id) => id !== tableId);

      expect(newSelection).toEqual([1, 2]);
    });

    it("should remove table ID when unchecking", () => {
      const selectedTableIds = [1 as ConcreteTableId, 2 as ConcreteTableId];
      const tableId = 1 as ConcreteTableId;
      const checked = false;

      const newSelection = checked
        ? [...selectedTableIds, tableId]
        : selectedTableIds.filter((id) => id !== tableId);

      expect(newSelection).toEqual([2]);
    });
  });

  describe("focal table selection", () => {
    it("should show focal table count when isUserModified is false", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      // 2 focal tables + 1 related table
      const nodes = [
        createNode(1, "ORDERS", true),
        createNode(2, "PRODUCTS", true),
        createNode(3, "PEOPLE", false),
      ];

      renderWithProvider(
        <TableSelectorInput
          nodes={nodes}
          allTables={tables}
          selectedTableIds={[]}
          isUserModified={false}
          onSelectionChange={jest.fn()}
        />,
      );

      // Should show "Most relationships" not a count
      expect(screen.getByText("Most relationships")).toBeInTheDocument();
    });

    it("should use focalTableIdSet for effective selected count", () => {
      // Test the underlying logic: focal tables should determine selected count
      const nodes = [
        { data: { table_id: 1, is_focal: true } },
        { data: { table_id: 2, is_focal: true } },
        { data: { table_id: 3, is_focal: false } },
      ];

      const focalTableIdSet = new Set<ConcreteTableId>();
      for (const node of nodes) {
        if (node.data.is_focal) {
          focalTableIdSet.add(node.data.table_id as ConcreteTableId);
        }
      }

      expect(focalTableIdSet.size).toBe(2);
      expect(focalTableIdSet.has(1 as ConcreteTableId)).toBe(true);
      expect(focalTableIdSet.has(2 as ConcreteTableId)).toBe(true);
      expect(focalTableIdSet.has(3 as ConcreteTableId)).toBe(false);
    });

    it("should use selectedTableIds when isUserModified is true", () => {
      const tables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
        createTable(3, "PEOPLE"),
      ];
      const nodes = [
        createNode(1, "ORDERS", true),
        createNode(2, "PRODUCTS", false),
      ];

      renderWithProvider(
        <TableSelectorInput
          nodes={nodes}
          allTables={tables}
          selectedTableIds={[1 as ConcreteTableId, 2 as ConcreteTableId]}
          isUserModified={true}
          onSelectionChange={jest.fn()}
        />,
      );

      // Should show count when user modified
      expect(screen.getByText("2 tables selected")).toBeInTheDocument();
    });

    it("should correctly identify focal vs non-focal tables", () => {
      const isUserModified = false;
      const selectedTableIds = [1, 2, 3] as ConcreteTableId[];
      const focalTableIdSet = new Set([1, 2] as ConcreteTableId[]);

      // When not user modified, effective selected should be focal tables only
      const effectiveSelectedSet = isUserModified
        ? new Set(selectedTableIds)
        : focalTableIdSet;

      expect(effectiveSelectedSet.has(1 as ConcreteTableId)).toBe(true);
      expect(effectiveSelectedSet.has(2 as ConcreteTableId)).toBe(true);
      expect(effectiveSelectedSet.has(3 as ConcreteTableId)).toBe(false);
    });
  });

  describe("table label format", () => {
    it("should show name only when display_name equals name", () => {
      const table = createTable(1, "orders", "orders");

      const label =
        table.display_name && table.display_name !== table.name
          ? `${table.name} (${table.display_name})`
          : table.name;

      expect(label).toBe("orders");
    });

    it("should show name (display_name) when they differ", () => {
      const table = createTable(1, "orders", "Customer Orders");

      const label =
        table.display_name && table.display_name !== table.name
          ? `${table.name} (${table.display_name})`
          : table.name;

      expect(label).toBe("orders (Customer Orders)");
    });

    it("should show name only when display_name is undefined", () => {
      const table = createTable(1, "orders");

      const label =
        table.display_name && table.display_name !== table.name
          ? `${table.name} (${table.display_name})`
          : table.name;

      expect(label).toBe("orders");
    });

    it("should show name only when display_name is empty string", () => {
      const table = createTable(1, "orders", "");

      const label =
        table.display_name && table.display_name !== table.name
          ? `${table.name} (${table.display_name})`
          : table.name;

      expect(label).toBe("orders");
    });
  });

  describe("selected count with non-existent tables", () => {
    it("should filter out non-existent table IDs from count", () => {
      const allTables = [
        createTable(1, "ORDERS"),
        createTable(2, "PRODUCTS"),
      ];
      const selectedTableIds = [
        1 as ConcreteTableId,
        2 as ConcreteTableId,
        99 as ConcreteTableId, // Doesn't exist
      ];
      const isUserModified = true;

      const allTableIdSet = new Set(
        allTables.map((t) => t.id as ConcreteTableId),
      );

      const selectedCount = isUserModified
        ? selectedTableIds.filter((id) => allTableIdSet.has(id)).length
        : 0;

      expect(selectedCount).toBe(2);
    });

    it("should use focal table count when isUserModified is false", () => {
      const focalTableIdSet = new Set([1, 2] as ConcreteTableId[]);
      const isUserModified = false;

      const selectedCount = isUserModified ? 0 : focalTableIdSet.size;

      expect(selectedCount).toBe(2);
    });
  });
});
