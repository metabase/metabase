import type { Active } from "@dnd-kit/core";

import type {
  DatasetColumn,
  VisualizerColumnReference,
  VisualizerDataSource,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import type { DraggedColumn } from "metabase-types/store/visualizer";

import { canHandleActiveItem } from "./use-can-handle-active-item";

const createMockActive = (column: DatasetColumn, type = "COLUMN"): Active => ({
  id: "test-id",
  data: {
    current: {
      type,
      column,
    },
  },
  rect: {
    current: {
      initial: null,
      translated: null,
    },
  },
});

const createMockHoveredItem = (
  column: DatasetColumn,
  dataSource: VisualizerDataSource,
): DraggedColumn => ({
  id: column.name!,
  data: {
    current: {
      type: "COLUMN" as const,
      column,
      dataSource,
    },
  },
});

describe("canHandleActiveItem", () => {
  describe("when no active item or hovered items", () => {
    it("returns false", () => {
      const result = canHandleActiveItem(null, null, () => true, []);
      expect(result).toBe(false);
    });
  });

  describe("when there are hovered items", () => {
    let column1: DatasetColumn;
    let column2: DatasetColumn;
    let hoveredItems: DraggedColumn[];
    let dataSource1: VisualizerDataSource;
    let dataSource2: VisualizerDataSource;

    beforeEach(() => {
      column1 = createMockColumn({ name: "avg" });
      column2 = createMockColumn({ name: "sum" });
      dataSource1 = {
        id: "card:1",
        sourceId: 1,
        name: "Source 1",
        type: "card",
      };
      dataSource2 = {
        id: "card:2",
        sourceId: 2,
        name: "Source 2",
        type: "card",
      };
      hoveredItems = [
        createMockHoveredItem(column1, dataSource1),
        createMockHoveredItem(column2, dataSource2),
      ];
    });

    it("returns true when all hovered items are not selected and suitable", () => {
      const result = canHandleActiveItem(null, hoveredItems, () => true, []);
      expect(result).toBe(true);
    });

    it("returns false when any hovered item is already selected", () => {
      const referencedColumns: VisualizerColumnReference[] = [
        { sourceId: "card:1", originalName: "avg", name: "COLUMN_1" },
      ];

      const result = canHandleActiveItem(
        null,
        hoveredItems,
        () => true,
        referencedColumns,
      );
      expect(result).toBe(false);
    });

    it("returns false when any hovered item is not suitable", () => {
      const result = canHandleActiveItem(
        null,
        hoveredItems,
        (column) => column.name !== "sum",
        [],
      );
      expect(result).toBe(false);
    });

    it("returns false when hovered items are both selected and unsuitable", () => {
      const singleHoveredItem = [createMockHoveredItem(column1, dataSource1)];
      const referencedColumns: VisualizerColumnReference[] = [
        { sourceId: "card:1", originalName: "avg", name: "COLUMN_1" },
      ];

      const result = canHandleActiveItem(
        null,
        singleHoveredItem,
        () => false,
        referencedColumns,
      );
      expect(result).toBe(false);
    });
  });

  describe("when there is an active dragged item", () => {
    let column: DatasetColumn;
    let active: Active;

    beforeEach(() => {
      column = createMockColumn({ name: "activeColumn" });
      active = createMockActive(column);
    });

    it("returns true when active item is a dragged column and is suitable", () => {
      const result = canHandleActiveItem(active, null, () => true, []);
      expect(result).toBe(true);
    });

    it("returns false when active item is a dragged column but not suitable", () => {
      const result = canHandleActiveItem(active, null, () => false, []);
      expect(result).toBe(false);
    });

    it("returns false when active item is not a dragged column", () => {
      const nonColumnActive = createMockActive(column, "WELL_ITEM");
      const result = canHandleActiveItem(nonColumnActive, null, () => true, []);
      expect(result).toBe(false);
    });
  });

  describe("precedence rules", () => {
    let hoveredColumn: DatasetColumn;
    let activeColumn: DatasetColumn;
    let active: Active;
    let hoveredItems: DraggedColumn[];

    beforeEach(() => {
      hoveredColumn = createMockColumn({ name: "hoveredColumn" });
      activeColumn = createMockColumn({ name: "activeColumn" });
      active = createMockActive(activeColumn);
      hoveredItems = [
        createMockHoveredItem(hoveredColumn, {
          id: "card:1",
          sourceId: 1,
          name: "Source 1",
          type: "card",
        }),
      ];
    });

    it("prioritizes hovered items over active item", () => {
      const result = canHandleActiveItem(
        active,
        hoveredItems,
        (column) => column.name === "hoveredColumn",
        [],
      );
      expect(result).toBe(true);
    });
  });

  describe("column selection detection", () => {
    let column: DatasetColumn;
    let hoveredItems: DraggedColumn[];

    beforeEach(() => {
      column = createMockColumn({ name: "avg" });
      hoveredItems = [
        createMockHoveredItem(column, {
          id: "card:1",
          sourceId: 1,
          name: "Source 1",
          type: "card",
        }),
      ];
    });

    it("correctly identifies selected columns across different data sources", () => {
      const referencedColumns: VisualizerColumnReference[] = [
        { sourceId: "card:2", originalName: "avg", name: "COLUMN_1" },
      ];

      const result = canHandleActiveItem(
        null,
        hoveredItems,
        () => true,
        referencedColumns,
      );
      expect(result).toBe(true);
    });

    it("correctly identifies selected columns with same data source", () => {
      const referencedColumns: VisualizerColumnReference[] = [
        { sourceId: "card:1", originalName: "avg", name: "COLUMN_1" },
      ];

      const result = canHandleActiveItem(
        null,
        hoveredItems,
        () => true,
        referencedColumns,
      );
      expect(result).toBe(false);
    });
  });
});
