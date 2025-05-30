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

type UseCascadeDeleteConfirmationProps = {
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
  handleRowDeleteBulk: (
    rowIndices: number[],
    deleteChildren?: boolean,
  ) => Promise<boolean>;
};

export function useCascadeDeleteConfirmation({
  selectedRowIndices,
  setRowSelection,
  handleRowDeleteBulk,
}: UseCascadeDeleteConfirmationProps) {
  const [
    isCascadeDeleteRequested,
    { open: requestCascadeDelete, close: cancelCascadeDelete },
  ] = useDisclosure(false);

  const [foreignKeyError, setForeignKeyError] =
    useState<ForeignKeyError | null>(null);

  const handleForeignKeyError = useCallback(
    (error: any) => {
      // Check if this is a foreign key constraint violation error
      if (
        error?.data?.errors?.[0]?.type ===
        "metabase.actions.error/violate-foreign-key-constraint"
      ) {
        const fkError = error.data.errors[0] as ForeignKeyError;
        setForeignKeyError(fkError);
        requestCascadeDelete();
        return true; // Indicates we handled the error
      }
      return false; // Let normal error handling proceed
    },
    [requestCascadeDelete],
  );

  const handleCascadeDeleteConfirmation = useCallback(async () => {
    const success = await handleRowDeleteBulk(selectedRowIndices, true);

    if (success) {
      setRowSelection({});
      setForeignKeyError(null);
    }

    cancelCascadeDelete();
  }, [
    cancelCascadeDelete,
    handleRowDeleteBulk,
    selectedRowIndices,
    setRowSelection,
  ]);

  const handleCancelCascadeDelete = useCallback(() => {
    setForeignKeyError(null);
    cancelCascadeDelete();
  }, [cancelCascadeDelete]);

  return {
    isCascadeDeleteRequested,
    foreignKeyError,
    handleForeignKeyError,
    onCascadeDeleteConfirmation: handleCascadeDeleteConfirmation,
    onCancelCascadeDelete: handleCancelCascadeDelete,
  };
}
