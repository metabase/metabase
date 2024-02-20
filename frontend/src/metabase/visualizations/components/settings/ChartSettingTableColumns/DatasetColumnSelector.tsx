import { useCallback, useMemo } from "react";

import type Question from "metabase-lib/Question";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";

import { TableColumnSelector } from "./TableColumnSelector";
import type {
  ColumnSettingItem,
  DragColumnProps,
  EditWidgetConfig,
} from "./types";
import {
  disableColumnInSettings,
  enableColumnInSettings,
  getColumnSettingsWithRefs,
  getDatasetColumnSettingItems,
  moveColumnInSettings,
} from "./utils";

export interface DatasetColumnSelectorProps {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[]) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
  question?: Question;
}

export const DatasetColumnSelector = ({
  value,
  columns: datasetColumns,
  getColumnName,
  onChange,
  onShowWidget,
  question,
}: DatasetColumnSelectorProps) => {
  const columnSettings = useMemo(() => {
    return getColumnSettingsWithRefs(value);
  }, [value]);

  const columnItems = useMemo(() => {
    return getDatasetColumnSettingItems(
      datasetColumns,
      columnSettings,
      question,
    );
  }, [datasetColumns, columnSettings, question]);

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
      onChange(moveColumnInSettings(columnSettings, columnItems, props));
    },
    [columnSettings, columnItems, onChange],
  );

  return (
    <TableColumnSelector
      columnItems={columnItems}
      getColumnName={({ datasetColumn }) => getColumnName(datasetColumn)}
      onEnableColumn={handleEnableColumn}
      onDisableColumn={handleDisableColumn}
      onDragColumn={handleDragColumn}
      onShowWidget={onShowWidget}
    />
  );
};
