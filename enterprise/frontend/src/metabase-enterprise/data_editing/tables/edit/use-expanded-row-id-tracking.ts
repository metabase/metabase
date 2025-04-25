import { useEffect, useState } from "react";

import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

type UseExpandedRowObjectIdTrackingProps = {
  objectId?: string;
  expandedRowIndex: number | undefined;
  datasetData: DatasetData | null | undefined;
  isCreateRowModalOpen: boolean;
  handleModalOpenAndExpandedRow: (rowIndex?: number) => void;
  onObjectIdChange: (objectId?: string) => void;
};

export function useExpandedRowObjectIdTracking({
  objectId,
  expandedRowIndex,
  datasetData,
  isCreateRowModalOpen,
  handleModalOpenAndExpandedRow,
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

      handleModalOpenAndExpandedRow(rowIndex);
      setInitialObjectId(undefined);
      return;
    }

    // Triggered when the expanded row modal is opened (do not account for create row modal)
    if (expandedRowIndex !== undefined && isCreateRowModalOpen) {
      const row = datasetData.rows[expandedRowIndex];
      const nextObjectId = row[pkColumnIndex]?.toString();

      if (nextObjectId !== objectId) {
        onObjectIdChange(nextObjectId);
      }
      return;
    }

    // Triggered when the create row modal is closed
    if (!isCreateRowModalOpen && objectId !== undefined) {
      onObjectIdChange(undefined);
    }
  }, [
    objectId,
    initialObjectId,
    datasetData,
    expandedRowIndex,
    isCreateRowModalOpen,
    handleModalOpenAndExpandedRow,
    onObjectIdChange,
  ]);
}
