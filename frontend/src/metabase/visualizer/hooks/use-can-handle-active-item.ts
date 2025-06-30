import type { Active } from "@dnd-kit/core";
import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import {
  getHoveredItems,
  getReferencedColumns,
} from "metabase/visualizer/selectors";
import { isDraggedColumnItem } from "metabase/visualizer/utils";
import type { DatasetColumn } from "metabase-types/api";

interface UseCanHandleActiveItemParams {
  active: Active | null;
  isSuitableColumn: (column: DatasetColumn) => boolean;
}

export function useCanHandleActiveItem({
  active,
  isSuitableColumn,
}: UseCanHandleActiveItemParams) {
  const hoveredItems = useSelector(getHoveredItems);
  const columnValuesMapping = useSelector(getReferencedColumns);

  const isColumnSelected = useMemo(() => {
    return (column: DatasetColumn, dataSourceId: string) => {
      return columnValuesMapping.find(
        (item) =>
          item.sourceId === dataSourceId && item.originalName === column.name,
      );
    };
  }, [columnValuesMapping]);

  return useMemo(() => {
    if (hoveredItems && hoveredItems.length > 0) {
      return hoveredItems.every((item) => {
        const { column, dataSource } = item.data.current;
        return (
          !isColumnSelected(column, dataSource.id) && isSuitableColumn(column)
        );
      });
    }

    if (active && isDraggedColumnItem(active)) {
      const { column } = active.data.current;
      return isSuitableColumn(column);
    }

    return false;
  }, [active, hoveredItems, isColumnSelected, isSuitableColumn]);
}
