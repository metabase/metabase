import { useMemo, useState } from "react";

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

export function useTableEditingModalController(): TableEditingModalController {
  const [modalState, setModalState] = useState<TableEditingModalState>({
    action: null,
    rowIndex: undefined, // TODO: replace with row: Record<string, RowValue>
  });

  return useMemo(
    () => ({
      state: modalState,
      openCreateRowModal: () =>
        setModalState({
          action: TableEditingModalAction.Create,
          rowIndex: undefined,
        }),
      openEditRowModal: (rowIndex: number) =>
        setModalState({ action: TableEditingModalAction.Edit, rowIndex }),
      closeModal: () =>
        // Preserve the rowIndex to avoid flickering when the modal is animated out
        setModalState((state) => ({
          ...state,
          action: null,
        })),
    }),
    [modalState],
  );
}
