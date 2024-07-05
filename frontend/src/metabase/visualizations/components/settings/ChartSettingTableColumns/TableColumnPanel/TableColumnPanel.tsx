import { useMemo, useCallback } from "react";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

import { ChartSettingOrderedItems } from "../../ChartSettingOrderedItems";
import type { EditWidgetData } from "../types";

import type { ColumnItem } from "./types";
import {
  getColumnItems,
  getEditWidgetData,
  moveColumnInSettings,
  toggleColumnInSettings,
} from "./utils";

interface TableColumnPanelProps {
  columns: DatasetColumn[];
  columnSettings: TableColumnOrderSetting[];
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[]) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
}

export const TableColumnPanel = ({
  columns,
  columnSettings,
  getColumnName,
  onChange,
  onShowWidget,
}: TableColumnPanelProps) => {
  const columnItems = useMemo(() => {
    return getColumnItems(columns, columnSettings);
  }, [columns, columnSettings]);

  const getItemName = useCallback(
    (columnItem: ColumnItem) => {
      return getColumnName(columnItem.column);
    },
    [getColumnName],
  );

  const handleEnableColumn = useCallback(
    (columnItem: ColumnItem) => {
      onChange(toggleColumnInSettings(columnItem, columnItems, true));
    },
    [onChange, columnItems],
  );

  const handleDisableColumn = useCallback(
    (columnItem: ColumnItem) => {
      onChange(toggleColumnInSettings(columnItem, columnItems, false));
    },
    [onChange, columnItems],
  );

  const handleDragColumn = useCallback(
    ({ id, newIndex }: DragEndEvent) => {
      const oldIndex = columnItems.findIndex(
        columnItem => getId(columnItem) === id,
      );

      onChange(moveColumnInSettings(columnItems, oldIndex, newIndex));
    },
    [columnItems, onChange],
  );

  const handleEditColumn = useCallback(
    (columnItem: ColumnItem, targetElement: HTMLElement) => {
      onShowWidget(getEditWidgetData(columnItem), targetElement);
    },
    [onShowWidget],
  );

  return (
    <div role="list" data-testid="chart-settings-table-columns">
      {columns.length > 0 && (
        <div role="group" data-testid="visible-columns">
          <ChartSettingOrderedItems
            getId={getId}
            items={columnItems}
            getItemName={getItemName}
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

function getId(columnItem: ColumnItem) {
  return columnItem.column.name;
}
