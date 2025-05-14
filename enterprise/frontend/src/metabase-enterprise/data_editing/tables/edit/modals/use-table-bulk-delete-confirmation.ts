import { useDisclosure } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback } from "react";

type UseTableBulkDeleteConfirmationProps = {
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
  handleRowDeleteBulk: (rowIndices: number[]) => Promise<boolean>;
};

export function useTableBulkDeleteConfirmation({
  selectedRowIndices,
  setRowSelection,
  handleRowDeleteBulk,
}: UseTableBulkDeleteConfirmationProps) {
  const [
    isDeleteBulkRequested,
    { open: requestDeleteBulk, close: cancelDeleteBulk },
  ] = useDisclosure(false);

  const handleDeleteBulkConfirmation = useCallback(async () => {
    const success = await handleRowDeleteBulk(selectedRowIndices);

    if (success) {
      setRowSelection({});
    }

    cancelDeleteBulk();
  }, [
    cancelDeleteBulk,
    handleRowDeleteBulk,
    selectedRowIndices,
    setRowSelection,
  ]);

  return {
    isDeleteBulkRequested,
    requestDeleteBulk,
    cancelDeleteBulk,
    onDeleteBulkConfirmation: handleDeleteBulkConfirmation,
  };
}
