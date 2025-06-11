import { useCallback, useEffect } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

import type { TableEditingScope } from "../../types";

import { useActionUpdateRowModalFromDataset } from "./use-action-update-row-modal";

type UseActionUpdateRowModalFromDatasetWithObjectId = {
  currentObjectId?: string;
  onObjectIdChange: (objectId?: string) => void;
  datasetData?: DatasetData;
  scope: TableEditingScope;
};

/**
 * In contrast to the `useActionUpdateRowModalFromDataset`, this hook relies on the
 * `currentObjectId` prop to determine which modal to open and when. It's designed
 * for editing modals with direct URL access, where the `currentObjectId` is passed
 * as a prop. This allows to keep the URL in sync with the modal state as well as
 * to support history navigation.
 *
 * Basically opening a modal triggers a URL change, which triggers `useEffect` hook
 * to open the modal based on the current object ID.
 */
export function useActionUpdateRowModalFromDatasetWithObjectId({
  currentObjectId,
  datasetData,
  scope,
  onObjectIdChange,
}: UseActionUpdateRowModalFromDatasetWithObjectId) {
  const {
    opened,
    actionFormDescription,
    rowIndex,
    rowData,
    openUpdateRowModal,
    closeUpdateRowModal,
  } = useActionUpdateRowModalFromDataset({
    datasetData,
    scope,
  });

  useEffect(() => {
    switch (currentObjectId) {
      case undefined:
        closeUpdateRowModal();
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
            openUpdateRowModal(rowIndex);
          }
        }
    }
  }, [currentObjectId, datasetData, openUpdateRowModal, closeUpdateRowModal]);

  const handleOpenUpdateRowModal = useCallback(
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

  const handleCloseUpdateRowModal = useCallback(() => {
    onObjectIdChange(undefined);
  }, [onObjectIdChange]);

  return {
    opened,
    actionFormDescription,
    rowIndex,
    rowData,
    openUpdateRowModal: handleOpenUpdateRowModal,
    closeUpdateRowModal: handleCloseUpdateRowModal,
  };
}
