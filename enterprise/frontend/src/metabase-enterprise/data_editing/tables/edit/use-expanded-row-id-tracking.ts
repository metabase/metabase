import { useEffect, useState } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

import {
  TableEditingModalAction,
  type TableEditingModalController,
} from "./use-table-modal";

type UseExpandedRowObjectIdTrackingProps = {
  objectId?: string;
  datasetData: DatasetData | null | undefined;
  modalController: TableEditingModalController;
  onObjectIdChange: (objectId?: string) => void;
};

export function useExpandedRowObjectIdTracking({
  objectId,
  datasetData,
  modalController,
  onObjectIdChange,
}: UseExpandedRowObjectIdTrackingProps) {
  const [initialObjectId, setInitialObjectId] = useState(objectId);

  useEffect(() => {
    if (!datasetData) {
      return;
    }

    const pkColumnIndex = datasetData.cols.findIndex(isPK);

    // Initial modal open when the page is loaded
    if (initialObjectId !== undefined) {
      const numericObjectId = parseInt(initialObjectId, 10);
      const rowIndex = datasetData.rows.findIndex(
        (row) =>
          row[pkColumnIndex] === initialObjectId ||
          row[pkColumnIndex] === numericObjectId,
      );

      modalController.openEditRowModal(rowIndex);
      setInitialObjectId(undefined);
      return;
    }

    // Triggered when the expanded row modal is opened (do not account for create row modal)
    if (
      modalController.state.action === TableEditingModalAction.Edit &&
      modalController.state.rowIndex !== undefined
    ) {
      const row = datasetData.rows[modalController.state.rowIndex];
      const nextObjectId = row[pkColumnIndex]?.toString();

      if (nextObjectId !== objectId) {
        onObjectIdChange(nextObjectId);
      }
      return;
    }

    // Triggered when the create row modal is closed
    if (modalController.state.action === null && objectId !== undefined) {
      onObjectIdChange(undefined);
    }
  }, [
    objectId,
    initialObjectId,
    datasetData,
    modalController,
    onObjectIdChange,
  ]);
}
