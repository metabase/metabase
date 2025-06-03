import { act, renderHook } from "@testing-library/react";

import { useForeignKeyConstraintHandling } from "./use-foreign-key-constraint-handling";

const mockOnCascadeDelete = jest.fn();
const mockSetRowSelection = jest.fn();

const defaultProps = {
  onCascadeDelete: mockOnCascadeDelete,
  selectedRowIndices: [0, 1, 2],
  constraintError: null,
  setRowSelection: mockSetRowSelection,
};

describe("useForeignKeyConstraintHandling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("foreign key error detection and modal opening via useEffect", () => {
    it("should not open modal or set error for non-foreign key errors", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = {
        data: {
          errors: { type: "some.other.error", message: "Some other error" },
        },
      } as any;

      rerender({ ...defaultProps, constraintError: error });

      expect(result.current.isForeignKeyModalOpen).toBe(false);
      expect(result.current.foreignKeyError).toBe(null);
    });

    it("should not open modal or set error for errors without data.errors", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = { message: "Some error" } as any;

      rerender({ ...defaultProps, constraintError: error });

      expect(result.current.isForeignKeyModalOpen).toBe(false);
      expect(result.current.foreignKeyError).toBe(null);
    });

    it("should open modal and set error for foreign key constraint errors", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "Foreign key constraint violation",
            "children-count": { "2": 5, "3": 2 },
          },
        },
      } as any;

      rerender({ ...defaultProps, constraintError: error });

      expect(result.current.isForeignKeyModalOpen).toBe(true);
      expect(result.current.foreignKeyError).toEqual({
        type: "metabase.actions.error/children-exist",
        message: "Foreign key constraint violation",
        children: { "2": 5, "3": 2 },
      });
    });
  });

  describe("error accumulation", () => {
    it("should accumulate children from multiple foreign key errors", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "FK violation 1",
            "children-count": { "2": 3, "3": 1 },
          },
        },
      } as any;

      rerender({ ...defaultProps, constraintError: error });

      expect(result.current.foreignKeyError).toEqual({
        type: "metabase.actions.error/children-exist",
        message: "FK violation 1",
        children: { "2": 3, "3": 1 },
      });
      expect(result.current.isForeignKeyModalOpen).toBe(true);
    });

    it("should handle errors with missing children property", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "FK violation without children",
            "children-count": {},
          },
        },
      } as any;

      rerender({ ...defaultProps, constraintError: error });

      expect(result.current.foreignKeyError).toEqual({
        type: "metabase.actions.error/children-exist",
        message: "FK violation without children",
        children: {},
      });
      expect(result.current.isForeignKeyModalOpen).toBe(true);
    });
  });

  describe("modal management", () => {
    it("should open modal when constraintError prop contains a foreign key error", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = {
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "FK violation",
            "children-count": { "2": 5 },
          },
        },
      } as any;

      rerender({ ...defaultProps, constraintError: error });

      expect(result.current.isForeignKeyModalOpen).toBe(true);
    });

    it("should close modal and reset state when cancelled", () => {
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        { initialProps: defaultProps },
      );

      const error = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "FK violation",
            "children-count": { "2": 5 },
          },
        },
      } as any;

      rerender({ ...defaultProps, constraintError: error });

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
    it("should call onCascadeDelete with selectedRowIndices on confirmation", async () => {
      mockOnCascadeDelete.mockResolvedValue(true);
      const currentSelectedIndices = [1, 3, 5];
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        {
          initialProps: {
            ...defaultProps,
            selectedRowIndices: currentSelectedIndices,
          },
        },
      );

      const error = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "FK violation",
            "children-count": { "2": 5 },
          },
        },
      } as any;

      rerender({
        ...defaultProps,
        selectedRowIndices: currentSelectedIndices,
        constraintError: error,
      });

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockOnCascadeDelete).toHaveBeenCalledWith(currentSelectedIndices);
    });

    it("should clear selection and close modal on successful cascade delete", async () => {
      mockOnCascadeDelete.mockResolvedValue(true);
      const currentSelectedIndices = [1, 3];
      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        {
          initialProps: {
            ...defaultProps,
            selectedRowIndices: currentSelectedIndices,
          },
        },
      );

      const error = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: {
            type: "metabase.actions.error/children-exist",
            message: "FK violation",
            "children-count": { "2": 5 },
          },
        },
      } as any;

      rerender({
        ...defaultProps,
        selectedRowIndices: currentSelectedIndices,
        constraintError: error,
      });

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockSetRowSelection).toHaveBeenCalledWith({});
      expect(result.current.isForeignKeyModalOpen).toBe(false);
      expect(result.current.foreignKeyError).toBe(null);
    });

    it("should close modal but not clear selection state on failed cascade delete", async () => {
      mockOnCascadeDelete.mockResolvedValue(false);
      const currentSelectedIndices = [1, 3];
      const initialErrorState = {
        type: "metabase.actions.error/children-exist",
        message: "FK violation",
        "children-count": { "2": 5 },
      };
      const errorPayload = {
        type: "metabase.actions.error/children-exist",
        data: {
          errors: initialErrorState,
        },
      } as any;

      const { result, rerender } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        {
          initialProps: {
            ...defaultProps,
            selectedRowIndices: currentSelectedIndices,
          },
        },
      );

      rerender({
        ...defaultProps,
        selectedRowIndices: currentSelectedIndices,
        constraintError: errorPayload,
      });

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockSetRowSelection).not.toHaveBeenCalled();
      expect(result.current.isForeignKeyModalOpen).toBe(false);
    });

    it("should close modal and not call onCascadeDelete when selectedRowIndices is empty", async () => {
      const { result } = renderHook(
        (props) => useForeignKeyConstraintHandling(props),
        {
          initialProps: {
            ...defaultProps,
            selectedRowIndices: [],
          },
        },
      );

      await act(async () => {
        await result.current.handleForeignKeyConfirmation();
      });

      expect(mockOnCascadeDelete).not.toHaveBeenCalled();
      expect(result.current.isForeignKeyModalOpen).toBe(false);
      expect(result.current.foreignKeyError).toBe(null);
    });
  });
});
