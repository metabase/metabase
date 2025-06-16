import { useCallback, useEffect } from "react";

import type { DatasetData } from "metabase-types/api";

import { getPkColumns, getRowUniqueKeyByPkIndexes } from "../utils";

import {
  type UseActionUpdateRowModalFromDatasetParams,
  useActionUpdateRowModalFromDataset,
} from "./use-action-update-row-modal";

type UseActionUpdateRowModalFromDatasetWithObjectId =
  UseActionUpdateRowModalFromDatasetParams & {
    currentObjectId?: string;
    onObjectIdChange: (objectId?: string) => void;
    datasetData?: DatasetData;
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
  fetchOnMount,
  onObjectIdChange,
}: UseActionUpdateRowModalFromDatasetWithObjectId) {
  const {
    opened,
    actionFormDescription,
    rowIndex,
    rowData,
    refetchActionFormDescription,
    openUpdateRowModal,
    closeUpdateRowModal,
  } = useActionUpdateRowModalFromDataset({
    datasetData,
    scope,
    fetchOnMount,
  });

  useEffect(() => {
    if (currentObjectId && datasetData) {
      const { cols, rows } = datasetData;
      const { indexes } = getPkColumns(cols);
      const rowIndex = rows.findIndex(
        (row) => getRowUniqueKeyByPkIndexes(indexes, row) === currentObjectId,
      );

      if (rowIndex !== -1) {
        openUpdateRowModal(rowIndex);
      }
    }

    if (!currentObjectId) {
      closeUpdateRowModal();
    }
  }, [currentObjectId, datasetData, openUpdateRowModal, closeUpdateRowModal]);

  const handleOpenUpdateRowModal = useCallback(
    (rowIndex: number) => {
      if (!datasetData) {
        return;
      }

      const { cols, rows } = datasetData;
      const { indexes } = getPkColumns(cols);
      const objectId = getRowUniqueKeyByPkIndexes(indexes, rows[rowIndex]);

      onObjectIdChange(objectId);
    },
    [datasetData, onObjectIdChange],
  );

  const handleCloseUpdateRowModal = useCallback(() => {
    onObjectIdChange(undefined);
  }, [onObjectIdChange]);

  return {
    opened,
    actionFormDescription,
    refetchActionFormDescription,
    rowIndex,
    rowData,
    openUpdateRowModal: handleOpenUpdateRowModal,
    closeUpdateRowModal: handleCloseUpdateRowModal,
  };
}
