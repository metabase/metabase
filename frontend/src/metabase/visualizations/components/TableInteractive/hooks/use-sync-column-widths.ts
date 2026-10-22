import { useEffect, useRef } from "react";
import _ from "underscore";

import type {
  DatasetColumn,
  DatasetData,
  VisualizationSettings,
} from "metabase-types/api";

const getColumnNames = (cols: DatasetColumn[]) => cols.map((col) => col.name);

const remapWidthsByName = (
  prevCols: DatasetColumn[],
  prevWidths: number[],
  cols: DatasetColumn[],
) => {
  const widthByName = new Map(
    prevCols.map((col, index) => [col.name, prevWidths[index]] as const),
  );
  return cols.map((col) => widthByName.get(col.name));
};

/**
 * Keeps `table.column_widths` aligned with the dataset columns when their names change: a reorder (drag and
 * drop, viz settings, or a changed query), added or removed columns, and hidden or shown columns all move each
 * saved width along with its column. Widths that changed together with the columns, as on browser history
 * navigation, are already aligned and are left alone.
 */
export function useSyncColumnWidths(
  onUpdateVisualizationSettings: (
    settingsUpdate: Partial<VisualizationSettings>,
  ) => void,
  data?: DatasetData,
  columnWidths?: number[],
) {
  const prevCols = useRef<DatasetColumn[]>();
  const prevWidths = useRef<number[]>();

  useEffect(() => {
    if (!data) {
      return;
    }

    const previousCols = prevCols.current;
    const previousWidths = prevWidths.current;
    prevCols.current = data.cols;
    prevWidths.current = columnWidths;

    const isColumnListChange =
      previousCols != null &&
      !_.isEqual(getColumnNames(previousCols), getColumnNames(data.cols));
    const areWidthsAlignedWithPreviousCols =
      previousWidths != null && _.isEqual(columnWidths, previousWidths);
    if (!isColumnListChange || !areWidthsAlignedWithPreviousCols) {
      return;
    }

    const widths = remapWidthsByName(previousCols, previousWidths, data.cols);
    onUpdateVisualizationSettings({
      "table.column_widths": widths.some((width) => width != null)
        ? widths
        : undefined,
    });
  }, [data, columnWidths, onUpdateVisualizationSettings]);
}
