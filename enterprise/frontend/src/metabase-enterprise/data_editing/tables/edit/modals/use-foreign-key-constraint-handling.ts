import { useDisclosure } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

import { isForeignKeyConstraintErrorResponse } from "../use-table-crud";

export interface ForeignKeyConstraintError {
  type: string;
  message: string;
  children: Record<string, number>;
}

export interface UseForeignKeyConstraintHandlingProps {
  constraintError: { type: string } | null;
  onCascadeDelete: (rowIndices: number[]) => Promise<boolean>;
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
}

export function useForeignKeyConstraintHandling({
  onCascadeDelete,
  selectedRowIndices,
  constraintError,
  setRowSelection,
}: UseForeignKeyConstraintHandlingProps) {
  const [
    isForeignKeyModalOpen,
    { open: openForeignKeyModal, close: closeForeignKeyModal },
  ] = useDisclosure(false);

  const [foreignKeyError, setForeignKeyError] =
    useState<ForeignKeyConstraintError | null>(null);

  useEffect(() => {
    if (isForeignKeyConstraintErrorResponse(constraintError)) {
      setForeignKeyError(extractForeignKeyError(constraintError));
      openForeignKeyModal();
    }
  }, [constraintError, openForeignKeyModal]);

  const handleForeignKeyConfirmation = useCallback(async () => {
    if (selectedRowIndices.length > 0) {
      const success = await onCascadeDelete(selectedRowIndices);
      if (success) {
        setRowSelection({});
        setForeignKeyError(null);
      }
    }
    closeForeignKeyModal();
  }, [
    onCascadeDelete,
    selectedRowIndices,
    closeForeignKeyModal,
    setRowSelection,
  ]);

  const handleForeignKeyCancel = useCallback(() => {
    setForeignKeyError(null);
    closeForeignKeyModal();
  }, [closeForeignKeyModal]);

  return {
    isForeignKeyModalOpen,
    foreignKeyError,
    handleForeignKeyConfirmation,
    handleForeignKeyCancel,
  };
}

function extractForeignKeyError(error: any): ForeignKeyConstraintError | null {
  const foreignKeyError = error.data.errors;

  if (!foreignKeyError) {
    return null;
  }

  // Accumulate children from all foreign key errors
  const accumulatedChildren: Record<string, number> = {};

  const childrenCount = foreignKeyError["children-count"] || {};
  Object.entries(childrenCount).forEach(([tableId, count]) => {
    const currentCount = accumulatedChildren[tableId] || 0;
    accumulatedChildren[tableId] = currentCount + (count as number);
  });

  return {
    type: foreignKeyError.type,
    message: foreignKeyError.message,
    children: accumulatedChildren,
  };
}
