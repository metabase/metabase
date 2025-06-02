import { act, renderHook } from "@testing-library/react";

import { useForeignKeyConstraintHandling } from "./use-foreign-key-constraint-handling";

const mockOnCascadeDelete = jest.fn();
const mockSetRowSelection = jest.fn();

const defaultProps = {
  onCascadeDelete: mockOnCascadeDelete,
  selectedRowIndices: [0, 1, 2],
  setRowSelection: mockSetRowSelection,
};

describe("useForeignKeyConstraintHandling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("foreign key error detection", () => {
    it("should return false for non-foreign key errors", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [{ type: "some.other.error", message: "Some other error" }],
        },
      };

      const isHandled = result.current.handleForeignKeyError(error, [0]);
      expect(isHandled).toBe(false);
    });

    it("should return false for errors without data.errors array", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = { message: "Some error" };

      const isHandled = result.current.handleForeignKeyError(error, [0]);
      expect(isHandled).toBe(false);
    });

    it("should return true for foreign key constraint errors", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "Foreign key constraint violation",
              children: { "2": 5, "3": 2 },
            },
          ],
        },
      };

      const isHandled = result.current.handleForeignKeyError(error, [0]);
      expect(isHandled).toBe(true);
      expect(result.current.isForeignKeyModalOpen).toBe(true);
    });
  });

  describe("error accumulation", () => {
    it("should accumulate children from multiple foreign key errors", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation 1",
              children: { "2": 3, "3": 1 },
            },
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation 2",
              children: { "2": 2, "4": 5 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [0, 1]);
      });

      expect(result.current.foreignKeyError).toEqual({
        type: "metabase.actions.error/violate-foreign-key-constraint",
        message: "FK violation 1",
        children: { "2": 5, "3": 1, "4": 5 }, // 3+2=5 for table 2
      });
    });

    it("should handle mixed error types and only accumulate from foreign key errors", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "some.other.error",
              message: "Other error",
            },
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation",
              children: { "2": 3 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [0]);
      });

      expect(result.current.foreignKeyError).toEqual({
        type: "metabase.actions.error/violate-foreign-key-constraint",
        message: "FK violation",
        children: { "2": 3 },
      });
    });

    it("should handle errors with missing children property", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation without children",
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [0]);
      });

      expect(result.current.foreignKeyError).toEqual({
        type: "metabase.actions.error/violate-foreign-key-constraint",
        message: "FK violation without children",
        children: {},
      });
    });
  });

  describe("modal management", () => {
    it("should open modal when foreign key error is handled", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      expect(result.current.isForeignKeyModalOpen).toBe(false);

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [0, 1]);
      });

      expect(result.current.isForeignKeyModalOpen).toBe(true);
    });

    it("should close modal and reset state when cancelled", () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [0, 1]);
      });

      expect(result.current.isForeignKeyModalOpen).toBe(true);
      expect(result.current.foreignKeyError).toBeTruthy();

      act(() => {
        result.current.handleForeignKeyCancel();
      });

      expect(result.current.isForeignKeyModalOpen).toBe(false);
      expect(result.current.foreignKeyError).toBe(null);
    });
  });

  describe("cascade delete confirmation", () => {
    it("should call onCascadeDelete with pending row indices on confirmation", async () => {
      mockOnCascadeDelete.mockResolvedValue(true);
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [1, 3, 5]);
      });

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockOnCascadeDelete).toHaveBeenCalledWith([1, 3, 5]);
    });

    it("should clear selection and close modal on successful cascade delete", async () => {
      mockOnCascadeDelete.mockResolvedValue(true);
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [1, 3]);
      });

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockSetRowSelection).toHaveBeenCalledWith({});
      expect(result.current.isForeignKeyModalOpen).toBe(false);
      expect(result.current.foreignKeyError).toBe(null);
    });

    it("should close modal but not clear state on failed cascade delete", async () => {
      mockOnCascadeDelete.mockResolvedValue(false);
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      const error = {
        data: {
          errors: [
            {
              type: "metabase.actions.error/violate-foreign-key-constraint",
              message: "FK violation",
              children: { "2": 5 },
            },
          ],
        },
      };

      act(() => {
        result.current.handleForeignKeyError(error, [1, 3]);
      });

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockSetRowSelection).not.toHaveBeenCalled();
      expect(result.current.isForeignKeyModalOpen).toBe(false);
      // Error state should remain for retry
      expect(result.current.foreignKeyError).toBeTruthy();
    });

    it("should close modal when no pending row indices", async () => {
      const { result } = renderHook(() =>
        useForeignKeyConstraintHandling(defaultProps),
      );

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockOnCascadeDelete).not.toHaveBeenCalled();
      expect(result.current.isForeignKeyModalOpen).toBe(false);
    });
  });
});
