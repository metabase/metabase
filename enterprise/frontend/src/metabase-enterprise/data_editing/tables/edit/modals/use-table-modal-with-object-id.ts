import { useCallback, useEffect } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

import {
  type TableEditingModalController,
  useTableEditingModalController,
} from "./use-table-modal";

/**
 * This is a special object ID used to indicate that the create row modal
 * should be opened. It's not a real object ID, but rather a placeholder.
 * We use it to keep the logic simple.
 */
const OBJECT_ID_CREATE_ROW = "create";

type UseTableEditingModalControllerWithObjectIdProps = {
  currentObjectId?: string;
  datasetData: DatasetData | null | undefined;
  onObjectIdChange: (objectId?: string) => void;
};

/**
 * In contrast to the `useTableEditingModalController`, this hook relies on the
 * `currentObjectId` prop to determine which modal to open and when. It's designed
 * for editing modals with direct URL access, where the `currentObjectId` is passed
 * as a prop. This allows to keep the URL in sync with the modal state as well as
 * to support history navigation.
 *
 * Basically opening a modal triggers a URL change, which triggers `useEffect` hook
 * to open the modal based on the current object ID.
 */
export function useTableEditingModalControllerWithObjectId({
  currentObjectId,
  datasetData,
  onObjectIdChange,
}: UseTableEditingModalControllerWithObjectIdProps): TableEditingModalController {
  const { state, openCreateRowModal, openEditRowModal, closeModal } =
    useTableEditingModalController();

  useEffect(() => {
    switch (currentObjectId) {
      case OBJECT_ID_CREATE_ROW:
        openCreateRowModal();
        break;

      case undefined:
        closeModal();
        break;

      default:
        if (datasetData) {
          const pkColumnIndex = datasetData.cols.findIndex(isPK);
          const rowIndex = datasetData.rows.findIndex(
            (row) =>
              row[pkColumnIndex] === currentObjectId ||
              row[pkColumnIndex] === Number(currentObjectId),
          );

          if (rowIndex !== -1) {
            openEditRowModal(rowIndex);
          }
        }
    }
  }, [
    currentObjectId,
    datasetData,
    openCreateRowModal,
    openEditRowModal,
    closeModal,
  ]);

  const handleOpenEditRowModal = useCallback(
    (rowIndex: number) => {
      if (!datasetData) {
        return;
      }

      const pkColumnIndex = datasetData.cols.findIndex(isPK);
      const objectId = datasetData.rows[rowIndex][pkColumnIndex];
      onObjectIdChange(objectId?.toString());
    },
    [datasetData, onObjectIdChange],
  );

  const handleOpenCreateRowModal = useCallback(() => {
    onObjectIdChange(OBJECT_ID_CREATE_ROW);
  }, [onObjectIdChange]);

  const handleCloseModal = useCallback(() => {
    onObjectIdChange(undefined);
  }, [onObjectIdChange]);

  return {
    state,
    openCreateRowModal: handleOpenCreateRowModal,
    openEditRowModal: handleOpenEditRowModal,
    closeModal: handleCloseModal,
  };
}
