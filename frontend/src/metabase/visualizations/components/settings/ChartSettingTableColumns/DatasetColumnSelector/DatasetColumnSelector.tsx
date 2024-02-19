import { useMemo } from "react";
import type * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import { ChartSettingOrderedItems } from "../../ChartSettingOrderedItems";
import { toggleColumnInSettings } from "../utils";
import type { ColumnSetting, EditWidgetData } from "../types";
import {
  getColumnItems,
  getEditWidgetData,
  moveColumnInSettings,
} from "./utils";
import type { ColumnItem, DragColumnProps } from "./types";

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
  onChange,
  onShowWidget,
}: DatasetColumnSelectorProps) => {
  const columnItems = useMemo(() => {
    return getColumnItems(query, stageIndex, columns, settings);
  }, [query, stageIndex, columns, settings]);

  const getItemName = (columnItem: ColumnItem) => {
    return getColumnName(columnItem.column);
  };

  const handleEnableColumn = (columnItem: ColumnItem) => {
    onChange(toggleColumnInSettings(columnItem, settings, true));
  };

  const handleDisableColumn = (columnItem: ColumnItem) => {
    onChange(toggleColumnInSettings(columnItem, settings, false));
  };

  const handleDragColumn = (props: DragColumnProps) => {
    onChange(moveColumnInSettings(columnItems, settings, props));
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
            onEnable={handleEnableColumn}
            onRemove={handleDisableColumn}
            onEdit={handleEditColumn}
            onSortEnd={handleDragColumn}
          />
        </div>
      )}
    </div>
  );
};
