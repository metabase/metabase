import { useCallback, useMemo } from "react";

import { useObjectDetailControls } from "metabase/visualizations/components/ObjectDetail/ObjectDetailControlsContext";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

export const useObjectDetail = ({ rows, cols }: DatasetData) => {
  const { zoomedObjectId, rowIndexToPkMap, zoomInRow, resetRowZoom } =
    useObjectDetailControls();

  const primaryKeyColumn: ColumnDescriptor | null = useMemo(() => {
    const primaryKeyColumns = cols.filter(isPK);

    if (primaryKeyColumns.length !== 1) {
      return null;
    }
    const primaryKeyColumn = primaryKeyColumns[0];

    return {
      column: primaryKeyColumn,
      index: cols.indexOf(primaryKeyColumn),
    };
  }, [cols]);

  const onOpenObjectDetail = useCallback(
    (rowIndex: number) => {
      let objectId: ObjectId;

      if (primaryKeyColumn) {
        const value = rows[rowIndex][primaryKeyColumn.index];
        objectId =
          typeof value === "number" || typeof value === "string"
            ? value
            : rowIndex;
      } else {
        objectId = rowIndexToPkMap?.[rowIndex] ?? rowIndex;
      }

      if (objectId === zoomedObjectId) {
        resetRowZoom();
      } else {
        zoomInRow({ objectId });
      }
    },
    [
      primaryKeyColumn,
      rowIndexToPkMap,
      rows,
      zoomedObjectId,
      zoomInRow,
      resetRowZoom,
    ],
  );

  return onOpenObjectDetail;
};
