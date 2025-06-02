import { useDisclosure } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

export interface ForeignKeyConstraintError {
  type: string;
  message: string;
  children: Record<string, number>;
}

export interface UseForeignKeyConstraintHandlingProps {
  onCascadeDelete: (rowIndices: number[]) => Promise<boolean>;
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
}

export function useForeignKeyConstraintHandling({
  onCascadeDelete,
  selectedRowIndices,
  setRowSelection,
}: UseForeignKeyConstraintHandlingProps) {
  const [
    isForeignKeyModalOpen,
    { open: openForeignKeyModal, close: closeForeignKeyModal },
  ] = useDisclosure(false);
  
  const [foreignKeyError, setForeignKeyError] = useState<ForeignKeyConstraintError | null>(null);
  const [pendingRowIndices, setPendingRowIndices] = useState<number[]>([]);

  const isForeignKeyConstraintError = useCallback((error: any): boolean => {
    if (!error?.data?.errors || !Array.isArray(error.data.errors)) {
      return false;
    }

    return error.data.errors.some(
      (err: any) => err?.type === "metabase.actions.error/violate-foreign-key-constraint"
    );
  }, []);

  const extractForeignKeyError = useCallback((error: any): ForeignKeyConstraintError | null => {
    if (!error?.data?.errors || !Array.isArray(error.data.errors)) {
      return null;
    }

    // Filter to only foreign key constraint errors
    const foreignKeyErrors = error.data.errors.filter(
      (err: any) => err?.type === "metabase.actions.error/violate-foreign-key-constraint"
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
  }, []);

  const handleForeignKeyError = useCallback((error: any, rowIndices: number[]) => {
    const foreignKeyError = extractForeignKeyError(error);
    if (foreignKeyError) {
      setForeignKeyError(foreignKeyError);
      setPendingRowIndices(rowIndices);
      openForeignKeyModal();
      return true;
    }
    return false;
  }, [extractForeignKeyError, openForeignKeyModal]);

  const handleForeignKeyConfirmation = useCallback(async () => {
    if (pendingRowIndices.length > 0) {
      const success = await onCascadeDelete(pendingRowIndices);
      if (success) {
        setPendingRowIndices([]);
        setForeignKeyError(null);
        setRowSelection({}); // Clear selection after successful deletion
      }
    }
    closeForeignKeyModal();
  }, [onCascadeDelete, pendingRowIndices, closeForeignKeyModal, setRowSelection]);

  const handleForeignKeyCancel = useCallback(() => {
    setPendingRowIndices([]);
    setForeignKeyError(null);
    closeForeignKeyModal();
  }, [closeForeignKeyModal]);

  return {
    isForeignKeyModalOpen,
    foreignKeyError,
    handleForeignKeyError,
    handleForeignKeyConfirmation,
    handleForeignKeyCancel,
  };
} 
