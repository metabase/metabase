import { useMemo } from "react";

import type * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

import { ChartSettingOrderedItems } from "../../ChartSettingOrderedItems";
import type { EditWidgetData } from "../types";

import type { ColumnItem, DragColumnProps } from "./types";
import {
  getColumnItems,
  getEditWidgetData,
  moveColumnInSettings,
  toggleColumnInSettings,
} from "./utils";

interface TableColumnPanelProps {
  query: Lib.Query;
  stageIndex: number;
  columns: DatasetColumn[];
  columnSettings: TableColumnOrderSetting[];
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[]) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
}

export const TableColumnPanel = ({
  query,
  stageIndex,
  columns,
  columnSettings,
  getColumnName,
  onChange,
  onShowWidget,
}: TableColumnPanelProps) => {
  const columnItems = useMemo(() => {
    return getColumnItems(query, stageIndex, columns, columnSettings);
  }, [query, stageIndex, columns, columnSettings]);

  const getItemName = (columnItem: ColumnItem) => {
    return getColumnName(columnItem.column);
  };

  const handleEnableColumn = (columnItem: ColumnItem) => {
    onChange(toggleColumnInSettings(columnItem, columnSettings, true));
  };

  const handleDisableColumn = (columnItem: ColumnItem) => {
    onChange(toggleColumnInSettings(columnItem, columnSettings, false));
  };

  const handleDragColumn = (props: DragColumnProps) => {
    onChange(moveColumnInSettings(columnItems, columnSettings, props));
  };

  const handleEditColumn = (
    columnItem: ColumnItem,
    targetElement: HTMLElement,
  ) => {
    onShowWidget(getEditWidgetData(columnItem), targetElement);
  };

  return (
    <div role="list" data-testid="chart-settings-table-columns">
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
