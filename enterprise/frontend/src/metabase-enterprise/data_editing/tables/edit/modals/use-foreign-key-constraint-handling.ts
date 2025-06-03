import { useDisclosure } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useState } from "react";

import {
  isForeignKeyConstraintError,
  isForeignKeyConstraintErrorResponse,
} from "../use-table-crud";

export interface ForeignKeyConstraintError {
  type: string;
  message: string;
  children: Record<string, number>;
}

export interface UseForeignKeyConstraintHandlingProps {
  onCascadeDelete: (rowIndices: number[]) => Promise<boolean>;
  selectedRowIndices: number[];
  constraintError: { type: string } | null;
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

  // const handleForeignKeyError = useCallback(() => {
  //   const foreignKeyError = extractForeignKeyError(constraintError);
  //   if (foreignKeyError) {
  //     setForeignKeyError(foreignKeyError);
  //     openForeignKeyModal();
  //     return true;
  //   }
  //   return false;
  // }, [constraintError, openForeignKeyModal]);

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
    // handleForeignKeyError,
    handleForeignKeyConfirmation,
    handleForeignKeyCancel,
  };
}

function extractForeignKeyError(error: any): ForeignKeyConstraintError | null {
  const foreignKeyErrors = error.data.errors.filter(
    isForeignKeyConstraintError,
  );

  if (foreignKeyErrors.length === 0) {
    return null;
  }

  // Accumulate children from all foreign key errors
  const accumulatedChildren: Record<string, number> = {};

  foreignKeyErrors.forEach((fkError: any) => {
    const children = fkError.children || {};
    Object.entries(children).forEach(([tableId, count]) => {
      const currentCount = accumulatedChildren[tableId] || 0;
      accumulatedChildren[tableId] = currentCount + (count as number);
    });
  });

  // Use the message from the first foreign key error
  const firstError = foreignKeyErrors[0];

  return {
    type: firstError.type,
    message: firstError.message,
    children: accumulatedChildren,
  };
}
