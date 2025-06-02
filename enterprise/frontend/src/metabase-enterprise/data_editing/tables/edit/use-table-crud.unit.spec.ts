import { act, renderHook } from "@testing-library/react";

import * as MetabaseEnterpriseApi from "metabase-enterprise/api";
import { createMockDatasetData } from "metabase-types/api/mocks";

import { useTableCRUD } from "./use-table-crud";
import type { TableEditingStateUpdateStrategy } from "./use-table-state-update-strategy";

// Mock the API hooks
jest.mock("metabase-enterprise/api", () => ({
  useDeleteTableRowsMutation: jest.fn(),
  useInsertTableRowsMutation: () => [jest.fn(), { isLoading: false }],
  useUpdateTableRowsMutation: () => [jest.fn(), { isLoading: false }],
}));

// Mock the metadata query
jest.mock("metabase/api", () => ({
  useGetTableQueryMetadataQuery: () => ({
    data: {
      fields: [
        { name: "id", isPK: true },
        { name: "name", isPK: false },
      ],
    },
  }),
}));

// Mock redux hooks
jest.mock("metabase/lib/redux", () => ({
  useDispatch: () => jest.fn(),
}));

// Mock optimistic update hook
jest.mock("./use-table-crud-optimistic-update", () => ({
  useTableCrudOptimisticUpdate: () => ({
    cellsWithFailedUpdatesMap: {},
    handleCellValueUpdateError: jest.fn(),
    handleGenericUpdateError: jest.fn(),
    handleCellValueUpdateSuccess: jest.fn(),
  }),
}));

const mockSetRowSelection = jest.fn();
const mockOnForeignKeyError = jest.fn();
const mockStateUpdateStrategy: TableEditingStateUpdateStrategy = {
  onRowsCreated: jest.fn(),
  onRowsUpdated: jest.fn(),
  onRowsDeleted: jest.fn(),
};

const mockDatasetData = createMockDatasetData({
  rows: [
    [1, "Row 1"],
    [2, "Row 2"],
    [3, "Row 3"],
  ],
  cols: [
    { name: "id", display_name: "ID", source: "fields" },
    { name: "name", display_name: "Name", source: "fields" },
  ],
});

const defaultProps = {
  tableId: 1,
  scope: { "table-id": 1 } as const,
  datasetData: mockDatasetData,
  stateUpdateStrategy: mockStateUpdateStrategy,
  setRowSelection: mockSetRowSelection,
  onForeignKeyError: mockOnForeignKeyError,
};

const mockedMetabaseEnterpriseApi = jest.mocked(MetabaseEnterpriseApi);

describe("useTableCRUD", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("row selection clearing", () => {
    it("should clear row selection after successful delete", async () => {
      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        data: { outputs: [{ op: "deleted", row: { id: 1 } }] },
      });

      // Mock the delete mutation
      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDelete(0);
      });

      expect(mockSetRowSelection).toHaveBeenCalledWith({});
    });

    it("should not clear row selection when delete fails", async () => {
      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        error: { message: "Delete failed" },
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDelete(0);
      });

      expect(mockSetRowSelection).not.toHaveBeenCalled();
    });

    it("should clear row selection after successful bulk delete", async () => {
      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        data: {
          outputs: [
            { op: "deleted", row: { id: 1 } },
            { op: "deleted", row: { id: 2 } },
          ],
        },
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDeleteBulk([0, 1]);
      });

      expect(mockSetRowSelection).toHaveBeenCalledWith({});
    });

    it("should not clear selection when setRowSelection is not provided", async () => {
      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        data: { outputs: [{ op: "deleted", row: { id: 1 } }] },
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() =>
        useTableCRUD({ ...defaultProps, setRowSelection: undefined }),
      );

      await act(async () => {
        await result.current.handleRowDelete(0);
      });

      // Should not throw an error
      expect(mockSetRowSelection).not.toHaveBeenCalled();
    });
  });

  describe("foreign key error handling", () => {
    it("should call onForeignKeyError when delete fails with FK constraint", async () => {
      const fkError = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK constraint violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        error: fkError,
      });

      mockOnForeignKeyError.mockReturnValue(true); // Indicate error was handled

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDelete(0);
      });

      expect(mockOnForeignKeyError).toHaveBeenCalledWith(fkError, [0]);
    });

    it("should not call onForeignKeyError for cascade delete", async () => {
      const fkError = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK constraint violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        error: fkError,
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDeleteWithCascade([0]);
      });

      expect(mockOnForeignKeyError).not.toHaveBeenCalled();
    });

    it("should not call onForeignKeyError when handler is not provided", async () => {
      const fkError = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK constraint violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        error: fkError,
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() =>
        useTableCRUD({ ...defaultProps, onForeignKeyError: undefined }),
      );

      await act(async () => {
        await result.current.handleRowDelete(0);
      });

      // Should not throw an error
      expect(mockOnForeignKeyError).not.toHaveBeenCalled();
    });
  });

  describe("cascade delete functionality", () => {
    it("should include delete-children parameter for cascade delete", async () => {
      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        data: { outputs: [{ op: "deleted", row: { id: 1 } }] },
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDeleteWithCascade([0]);
      });

      expect(mockDeleteTableRows).toHaveBeenCalledWith({
        rows: [{ id: 1 }],
        scope: { "table-id": 1 },
        params: { "delete-children": true },
      });
    });

    it("should not include delete-children parameter for regular delete", async () => {
      const mockDeleteTableRows = jest.fn().mockResolvedValue({
        data: { outputs: [{ op: "deleted", row: { id: 1 } }] },
      });

      mockedMetabaseEnterpriseApi.useDeleteTableRowsMutation.mockReturnValue([
        mockDeleteTableRows,
        { isLoading: false, reset: jest.fn() },
      ]);

      const { result } = renderHook(() => useTableCRUD(defaultProps));

      await act(async () => {
        await result.current.handleRowDelete(0);
      });

      expect(mockDeleteTableRows).toHaveBeenCalledWith({
        rows: [{ id: 1 }],
        scope: { "table-id": 1 },
      });
    });
  });

  describe("error scenarios", () => {
    it("should handle missing dataset data gracefully", async () => {
      const { result } = renderHook(() =>
        useTableCRUD({ ...defaultProps, datasetData: null }),
      );

      const success = await act(async () => {
        return await result.current.handleRowDelete(0);
      });

      expect(success).toBe(false);
      expect(mockSetRowSelection).not.toHaveBeenCalled();
    });

    it("should handle empty dataset data gracefully", async () => {
      const emptyData = createMockDatasetData({
        rows: [],
        cols: [],
      });

      const { result } = renderHook(() =>
        useTableCRUD({ ...defaultProps, datasetData: emptyData }),
      );

      const success = await act(async () => {
        return await result.current.handleRowDelete(0);
      });

      expect(success).toBe(false);
    });
  });
});
