import { useCallback, useMemo } from "react";

import type { DragEndEvent } from "metabase/common/components/Sortable";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box } from "metabase/ui";
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
  isShowingDetailsOnlyColumns: boolean;
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[]) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
}

export const TableColumnPanel = ({
  columns,
  columnSettings,
  getColumnName,
  isShowingDetailsOnlyColumns,
  onChange,
  onShowWidget,
}: TableColumnPanelProps) => {
  const tc = useTranslateContent();
  const columnItems = useMemo(() => {
    return getColumnItems(
      columns,
      columnSettings,
      tc,
      isShowingDetailsOnlyColumns,
    );
  }, [columns, columnSettings, tc, isShowingDetailsOnlyColumns]);

  const getItemName = useCallback(
    (columnItem: ColumnItem) => {
      return tc(getColumnName(columnItem.column));
    },
    [getColumnName, tc],
  );

  const handleEnableColumn = useCallback(
    (columnItem: ColumnItem) => {
      onChange(toggleColumnInSettings(columnSettings, columnItem, true));
    },
    [columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: ColumnItem) => {
      onChange(toggleColumnInSettings(columnSettings, columnItem, false));
    },
    [columnSettings, onChange],
  );

  const handleDragColumn = useCallback(
    ({ id, newIndex }: DragEndEvent) => {
      const oldIndex = columnItems.findIndex(
        (columnItem) => getId(columnItem) === id,
      );

      onChange(
        moveColumnInSettings(columnSettings, columnItems, oldIndex, newIndex),
      );
    },
    [columnSettings, columnItems, onChange],
  );

  const handleEditColumn = useCallback(
    (columnItem: ColumnItem, targetElement: HTMLElement) => {
      onShowWidget(getEditWidgetData(columnItem), targetElement);
    },
    [onShowWidget],
  );

  return (
    <Box role="list" data-testid="chart-settings-table-columns">
      {columnItems.length > 0 && (
        <Box role="group" data-testid="visible-columns">
          <ChartSettingOrderedItems
            getId={getId}
            items={columnItems}
            getItemName={getItemName}
            onEnable={handleEnableColumn}
            onRemove={handleDisableColumn}
            onEdit={handleEditColumn}
            onSortEnd={handleDragColumn}
          />
        </Box>
      )}
    </Box>
  );
};

function getId(columnItem: ColumnItem) {
  return columnItem.column.name;
}
