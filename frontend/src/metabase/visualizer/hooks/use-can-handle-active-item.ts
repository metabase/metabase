import type { Active } from "@dnd-kit/core";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  getHoveredItems,
  getReferencedColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import type {
  DatasetColumn,
  VisualizerColumnReference,
} from "metabase-types/api";
import type { DraggedColumn } from "metabase-types/store/visualizer";

interface UseCanHandleActiveItemParams {
  active: Active | null;
  isSuitableColumn: (column: DatasetColumn) => boolean;
}

function isColumnSelected(
  column: DatasetColumn,
  dataSourceId: string,
  columnValuesMapping: VisualizerColumnReference[],
) {
  return !!columnValuesMapping.find(
    (item) =>
      item.sourceId === dataSourceId && item.originalName === column.name,
  );
}

/**
 * Exported for testing purposes.
 *
 * @internal
 */
export function canHandleActiveItem(
  active: Active | null,
  hoveredItems: DraggedColumn[] | null,
  isSuitableColumn: (column: DatasetColumn) => boolean,
  columnValuesMapping: VisualizerColumnReference[],
): boolean {
  if (hoveredItems && hoveredItems.length > 0) {
    return hoveredItems.every((item) => {
      const { column, dataSource } = item.data.current;
      return (
        !isColumnSelected(column, dataSource.id, columnValuesMapping) &&
        isSuitableColumn(column)
      );
    });
  }

  if (active && isDraggedColumnItem(active)) {
    const { column } = active.data.current;
    return isSuitableColumn(column);
  }

  return false;
}

/**
 * Determines if the active item can be handled based on the hovered items and the active item.
 * Conditions highlighting wells in the visualizer.
 *
 * @param params The parameters for the hook.
 * @param params.active The currently active draggable item.
 * @param params.isSuitableColumn A function to check if a column is suitable.
 * @returns Returns true if the active item can be handled, false otherwise.
 */
export function useCanHandleActiveItem({
  active,
  isSuitableColumn,
}: UseCanHandleActiveItemParams) {
  const hoveredItems = useSelector(getHoveredItems);
  const columnValuesMapping = useSelector(getReferencedColumns);

  return useMemo(() => {
    return canHandleActiveItem(
      active,
      hoveredItems,
      isSuitableColumn,
      columnValuesMapping,
    );
  }, [active, hoveredItems, isSuitableColumn, columnValuesMapping]);
}
