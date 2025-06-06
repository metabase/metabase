import { useCallback, useState } from "react";

export enum TableEditingModalAction {
  Create = "create",
  Edit = "edit",
}

export type TableEditingModalState = {
  action: TableEditingModalAction | null;
  rowIndex?: number;
};

export type TableEditingModalController = {
  state: TableEditingModalState;
  openCreateRowModal: () => void;
  openEditRowModal: (rowIndex: number) => void;
  closeModal: () => void;
};

/**
 * Simple controller to manage the state of the table editing modal.
 * See `useTableEditingModalControllerWithObjectId` for a more complex
 * implementation that relies on the `currentObjectId` prop.
 */
export function useTableEditingModalController(): TableEditingModalController {
  const [modalState, setModalState] = useState<TableEditingModalState>({
    action: null,
    rowIndex: undefined, // TODO: replace with row: Record<string, RowValue>
  });

  const handleOpenCreateRowModal = useCallback(() => {
    setModalState({
      action: TableEditingModalAction.Create,
      rowIndex: undefined,
    });
  }, []);

  const handleOpenEditRowModal = useCallback((rowIndex: number) => {
    setModalState({ action: TableEditingModalAction.Edit, rowIndex });
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalState((state) => ({
      ...state,
      action: null,
    }));
  }, []);

  return {
    state: modalState,
    openCreateRowModal: handleOpenCreateRowModal,
    openEditRowModal: handleOpenEditRowModal,
    closeModal: handleCloseModal,
  };
}
