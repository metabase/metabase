import { useMemo } from "react";
import type * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import { ChartSettingOrderedItems } from "../../ChartSettingOrderedItems";
import type { ColumnSetting, EditWidgetData } from "../types";
import type { ColumnItem } from "./types";
import { getColumnItems, getEditWidgetData } from "./utils";

interface DatasetColumnSelectorProps {
  query: Lib.Query;
  stageIndex: number;
  columns: DatasetColumn[];
  settings: ColumnSetting[];
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[]) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
}

export const DatasetColumnSelector = ({
  query,
  stageIndex,
  columns,
  settings,
  getColumnName,
  onShowWidget,
}: DatasetColumnSelectorProps) => {
  const columnItems = useMemo(() => {
    return getColumnItems(query, stageIndex, columns, settings);
  }, [query, stageIndex, columns, settings]);

  const getItemName = (columnItem: ColumnItem) => {
    return getColumnName(columnItem.column);
  };

  const handleEditColumn = (
    columnItem: ColumnItem,
    targetElement: HTMLElement,
  ) => {
    onShowWidget(getEditWidgetData(columnItem), targetElement);
  };

  return (
    <div role="list" aria-label="chart-settings-table-columns">
      {columns.length > 0 && (
        <div role="group" data-testid="visible-columns">
          <ChartSettingOrderedItems
            items={columnItems}
            getItemName={getItemName}
            distance={5}
            onEdit={handleEditColumn}
            onSortEnd={() => 0}
          />
        </div>
      )}
    </div>
  );
};
