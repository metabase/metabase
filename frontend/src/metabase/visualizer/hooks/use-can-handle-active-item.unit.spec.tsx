import type { Active } from "@dnd-kit/core";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import { MetabaseReduxProvider } from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import {
  getHoveredItems,
  getReferencedColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import type { DatasetColumn, VisualizerDataSource } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useCanHandleActiveItem } from "./use-can-handle-active-item";

// Mock the selectors
jest.mock("metabase/visualizer/selectors", () => ({
  getHoveredItems: jest.fn(),
  getReferencedColumns: jest.fn(),
}));

jest.mock("metabase/visualizer/utils", () => ({
  isDraggedColumnItem: jest.fn(),
}));

const mockGetHoveredItems = getHoveredItems as jest.MockedFunction<
  typeof getHoveredItems
>;
const mockGetReferencedColumns = getReferencedColumns as jest.MockedFunction<
  typeof getReferencedColumns
>;
const mockIsDraggedColumnItem = isDraggedColumnItem as jest.MockedFunction<
  typeof isDraggedColumnItem
>;

const renderHookWithProvider = (
  params: Parameters<typeof useCanHandleActiveItem>[0],
) => {
  const store = getStore(mainReducers, undefined, createMockState());

  const Wrapper = ({ children }: PropsWithChildren) => (
    <MetabaseReduxProvider store={store}>{children}</MetabaseReduxProvider>
  );
  return renderHook(() => useCanHandleActiveItem(params), {
    wrapper: Wrapper,
  });
};

const createMockActive = (column: DatasetColumn): Active => ({
  id: "test-id",
  data: {
    current: {
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
  dataSourceId: string,
) => ({
  id: column.name!,
  data: {
    current: {
      type: "COLUMN" as const,
      column,
      dataSource: { id: dataSourceId } as VisualizerDataSource,
    },
  },
});

describe("useCanHandleActiveItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetHoveredItems.mockReturnValue(null);
    mockGetReferencedColumns.mockReturnValue([]);
    mockIsDraggedColumnItem.mockReturnValue(false);
  });

  describe("when no active item or hovered items", () => {
    it("returns false", () => {
      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(false);
    });
  });

  describe("when there are hovered items", () => {
    it("returns true when all hovered items are not selected and suitable", () => {
      const column1 = createMockColumn({ name: "avg" });
      const column2 = createMockColumn({ name: "sum" });

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(column1, "card:1"),
        createMockHoveredItem(column2, "card:2"),
      ]);

      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(true);
    });

    it("returns false when any hovered item is already selected", () => {
      const column1 = createMockColumn({
        name: "avg",
      });
      const column2 = createMockColumn({
        name: "sum",
      });

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(column1, "card:1"),
        createMockHoveredItem(column2, "card:2"),
      ]);

      // Mock COLUMN_1 as already selected
      mockGetReferencedColumns.mockReturnValue([
        { sourceId: "card:1", originalName: "avg", name: "COLUMN_1" },
      ]);

      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(false);
    });

    it("returns false when any hovered item is not suitable", () => {
      const column1 = createMockColumn({ name: "avg" });
      const column2 = createMockColumn({ name: "sum" });

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(column1, "card:1"),
        createMockHoveredItem(column2, "card:2"),
      ]);

      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: (column) => column.name !== "sum",
      });

      expect(result.current).toBe(false);
    });

    it("returns false when hovered items are both selected and unsuitable", () => {
      const column1 = createMockColumn({ name: "avg" });

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(column1, "card:1"),
      ]);

      mockGetReferencedColumns.mockReturnValue([
        { sourceId: "card:1", originalName: "avg", name: "COLUMN_1" },
      ]);

      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: () => false,
      });

      expect(result.current).toBe(false);
    });
  });

  describe("when there is an active dragged item", () => {
    it("returns true when active item is a dragged column and is suitable", () => {
      const column = createMockColumn({ name: "activeColumn" });
      const active = createMockActive(column);

      mockIsDraggedColumnItem.mockReturnValue(true);

      const { result } = renderHookWithProvider({
        active,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(true);
    });

    it("returns false when active item is a dragged column but not suitable", () => {
      const column = createMockColumn({ name: "activeColumn" });
      const active = createMockActive(column);

      mockIsDraggedColumnItem.mockReturnValue(true);

      const { result } = renderHookWithProvider({
        active,
        isSuitableColumn: () => false,
      });

      expect(result.current).toBe(false);
    });

    it("returns false when active item is not a dragged column", () => {
      const column = createMockColumn({ name: "activeColumn" });
      const active = createMockActive(column);

      mockIsDraggedColumnItem.mockReturnValue(false);

      const { result } = renderHookWithProvider({
        active,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(false);
    });
  });

  describe("precedence rules", () => {
    it("prioritizes hovered items over active item", () => {
      const hoveredColumn = createMockColumn({ name: "hoveredColumn" });
      const activeColumn = createMockColumn({ name: "activeColumn" });
      const active = createMockActive(activeColumn);

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(hoveredColumn, "card:1"),
      ]);
      mockIsDraggedColumnItem.mockReturnValue(true);

      const { result } = renderHookWithProvider({
        active,
        isSuitableColumn: (column) => column.name === "hoveredColumn",
      });

      // Should return true based on hovered item, not active item
      expect(result.current).toBe(true);
    });
  });

  describe("column selection detection", () => {
    it("correctly identifies selected columns across different data sources", () => {
      const column = createMockColumn({ name: "avg" });

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(column, "card:1"),
      ]);

      // Same column name but different data source - should not be considered selected
      mockGetReferencedColumns.mockReturnValue([
        { sourceId: "card:2", originalName: "avg", name: "COLUMN_1" },
      ]);

      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(true);
    });

    it("correctly identifies selected columns with same data source", () => {
      const column = createMockColumn({ name: "avg" });

      mockGetHoveredItems.mockReturnValue([
        createMockHoveredItem(column, "card:1"),
      ]);

      // Same column name and same data source - should be considered selected
      mockGetReferencedColumns.mockReturnValue([
        { sourceId: "card:1", originalName: "avg", name: "COLUMN_1" },
      ]);

      const { result } = renderHookWithProvider({
        active: null,
        isSuitableColumn: () => true,
      });

      expect(result.current).toBe(false);
    });
  });
});
