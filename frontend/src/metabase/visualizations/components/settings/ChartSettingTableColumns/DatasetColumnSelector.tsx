import { useCallback, useMemo } from "react";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import { TableColumnSelector } from "./TableColumnSelector";
import {
  disableColumnInSettings,
  enableColumnInSettings,
  getDatasetColumnSettingItems,
  moveColumnInSettings,
} from "./utils";
import { ColumnSettingItem, DragColumnProps, EditWidgetConfig } from "./types";

export interface DatasetColumnSelectorProps {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[]) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
}

export const DatasetColumnSelector = ({
  value: columnSettings,
  columns: datasetColumns,
  getColumnName,
  onChange,
  onShowWidget,
}: DatasetColumnSelectorProps) => {
  const columnItems = useMemo(() => {
    return getDatasetColumnSettingItems(datasetColumns, columnSettings);
  }, [datasetColumns, columnSettings]);

  const enabledColumnItems = useMemo(() => {
    return columnItems.filter(({ enabled }) => enabled);
  }, [columnItems]);

  const disabledColumnItems = useMemo(() => {
    return columnItems.filter(({ enabled }) => !enabled);
  }, [columnItems]);

  const handleEnableColumn = useCallback(
    (columnItem: ColumnSettingItem) => {
      onChange(enableColumnInSettings(columnSettings, columnItem));
    },
    [columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: ColumnSettingItem) => {
      onChange(disableColumnInSettings(columnSettings, columnItem));
    },
    [columnSettings, onChange],
  );

  const handleDragColumn = useCallback(
    (props: DragColumnProps) => {
      onChange(moveColumnInSettings(columnSettings, enabledColumnItems, props));
    },
    [columnSettings, enabledColumnItems, onChange],
  );

  return (
    <TableColumnSelector
      enabledColumnItems={enabledColumnItems}
      disabledColumnItems={disabledColumnItems}
      getColumnName={getColumnName}
      onEnableColumn={handleEnableColumn}
      onDisableColumn={handleDisableColumn}
      onDragColumn={handleDragColumn}
      onShowWidget={onShowWidget}
    />
  );
};
