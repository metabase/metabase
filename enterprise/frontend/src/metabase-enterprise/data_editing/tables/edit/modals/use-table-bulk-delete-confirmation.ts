import { useDisclosure } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

type ForeignKeyError = {
  index: number;
  error: string;
  type: "metabase.actions.error/violate-foreign-key-constraint";
  message: string;
  errors: Record<string, unknown>;
  "status-code": number;
  children: Record<string, number>;
};

type UseTableBulkDeleteConfirmationProps = {
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
  handleRowDeleteBulk: (rowIndices: number[]) => Promise<boolean>;
  handleRowDeleteBulkWithErrorHandling?: (
    rowIndices: number[],
    deleteChildren?: boolean,
  ) => Promise<{ success: boolean; error: any }>;
};

export function useTableBulkDeleteConfirmation({
  selectedRowIndices,
  setRowSelection,
  handleRowDeleteBulk,
  handleRowDeleteBulkWithErrorHandling,
}: UseTableBulkDeleteConfirmationProps) {
  const [
    isDeleteBulkRequested,
    { open: requestDeleteBulk, close: cancelDeleteBulk },
  ] = useDisclosure(false);

  const [
    isCascadeDeleteRequested,
    { open: requestCascadeDelete, close: cancelCascadeDelete },
  ] = useDisclosure(false);

  const [foreignKeyError, setForeignKeyError] =
    useState<ForeignKeyError | null>(null);

  const handleDeleteBulkConfirmation = useCallback(async () => {
    let success: boolean;

    // If we have error handling available, use it to catch foreign key violations
    if (handleRowDeleteBulkWithErrorHandling) {
      const result =
        await handleRowDeleteBulkWithErrorHandling(selectedRowIndices);
      success = result.success;

      // Check if this is a foreign key constraint violation
      if (
        !success &&
        result.error?.data?.errors?.[0]?.type ===
          "metabase.actions.error/violate-foreign-key-constraint"
      ) {
        const fkError = result.error.data.errors[0] as ForeignKeyError;
        setForeignKeyError(fkError);
        cancelDeleteBulk();
        requestCascadeDelete();
        return;
      }
    } else {
      success = await handleRowDeleteBulk(selectedRowIndices);
    }

    if (success) {
      setRowSelection({});
    }

    cancelDeleteBulk();
  }, [
    cancelDeleteBulk,
    handleRowDeleteBulk,
    handleRowDeleteBulkWithErrorHandling,
    selectedRowIndices,
    setRowSelection,
    requestCascadeDelete,
  ]);

  const handleCascadeDeleteConfirmation = useCallback(async () => {
    if (!handleRowDeleteBulkWithErrorHandling) {
      cancelCascadeDelete();
      return;
    }

    const result = await handleRowDeleteBulkWithErrorHandling(
      selectedRowIndices,
      true,
    );

    if (result.success) {
      setRowSelection({});
      setForeignKeyError(null);
    }

    cancelCascadeDelete();
  }, [
    cancelCascadeDelete,
    handleRowDeleteBulkWithErrorHandling,
    selectedRowIndices,
    setRowSelection,
  ]);

  const handleCancelCascadeDelete = useCallback(() => {
    setForeignKeyError(null);
    cancelCascadeDelete();
  }, [cancelCascadeDelete]);

  return {
    isDeleteBulkRequested,
    isCascadeDeleteRequested,
    foreignKeyError,
    requestDeleteBulk,
    cancelDeleteBulk,
    onDeleteBulkConfirmation: handleDeleteBulkConfirmation,
    onCascadeDeleteConfirmation: handleCascadeDeleteConfirmation,
    onCancelCascadeDelete: handleCancelCascadeDelete,
  };
}
