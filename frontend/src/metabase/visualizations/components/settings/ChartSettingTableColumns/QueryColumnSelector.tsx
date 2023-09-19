import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { Button } from "metabase/ui";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import type * as Lib from "metabase-lib";
import { TableColumnSelector } from "./TableColumnSelector";
import {
  addColumnInQuery,
  addColumnInSettings,
  disableColumnInQuery,
  disableColumnInSettings,
  enableColumnInQuery,
  enableColumnInSettings,
  getAdditionalMetadataColumns,
  getColumnGroups,
  getColumnSettingsWithRefs,
  getMetadataColumns,
  getQueryColumnSettingItems,
  moveColumnInSettings,
} from "./utils";
import type {
  ColumnMetadataItem,
  ColumnSettingItem,
  DragColumnProps,
  EditWidgetConfig,
} from "./types";

export interface QueryColumnSelectorProps {
  value: TableColumnOrderSetting[];
  query: Lib.Query;
  columns: DatasetColumn[];
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[], query?: Lib.Query) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
  handleWidgetOverride: (key: string) => void;
}

export const QueryColumnSelector = ({
  value,
  query,
  columns: datasetColumns,
  getColumnName,
  onChange,
  onShowWidget,
  handleWidgetOverride,
}: QueryColumnSelectorProps) => {
  const columnSettings = useMemo(() => {
    return getColumnSettingsWithRefs(value);
  }, [value]);

  const metadataColumns = useMemo(() => {
    return getMetadataColumns(query);
  }, [query]);

  const columnItems = useMemo(() => {
    return getQueryColumnSettingItems(
      query,
      metadataColumns,
      datasetColumns,
      columnSettings,
    );
  }, [query, metadataColumns, datasetColumns, columnSettings]);

  const additionalColumnGroups = useMemo(() => {
    return getColumnGroups(
      query,
      getAdditionalMetadataColumns(metadataColumns, columnItems),
    );
  }, [query, metadataColumns, columnItems]);

  const enabledColumnItems = useMemo(() => {
    return columnItems.filter(({ enabled }) => enabled);
  }, [columnItems]);

  const disabledColumnItems = useMemo(() => {
    return columnItems.filter(({ enabled }) => !enabled);
  }, [columnItems]);

  const handleAddColumn = useCallback(
    (columnItem: ColumnMetadataItem) => {
      const newSettings = addColumnInSettings(
        query,
        columnSettings,
        columnItem,
      );
      const newQuery = addColumnInQuery(query, columnItem);
      onChange(newSettings, newQuery);
    },
    [query, columnSettings, onChange],
  );

  const handleEnableColumn = useCallback(
    (columnItem: ColumnSettingItem) => {
      const newSettings = enableColumnInSettings(columnSettings, columnItem);
      const newQuery = enableColumnInQuery(query, columnItem);
      onChange(newSettings, newQuery);
    },
    [query, columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: ColumnSettingItem) => {
      const newSettings = disableColumnInSettings(columnSettings, columnItem);
      const newQuery = disableColumnInQuery(query, columnItem);
      onChange(newSettings, newQuery);
    },
    [query, columnSettings, onChange],
  );

  const handleDragColumn = useCallback(
    (props: DragColumnProps) => {
      onChange(moveColumnInSettings(columnSettings, enabledColumnItems, props));
    },
    [columnSettings, enabledColumnItems, onChange],
  );

  return (
    <>
      <Button
        variant="subtle"
        onClick={() => handleWidgetOverride("table.columnVisibility")}
      >{t`Click me`}</Button>
      <TableColumnSelector
        enabledColumnItems={enabledColumnItems}
        disabledColumnItems={disabledColumnItems}
        additionalColumnGroups={additionalColumnGroups}
        getColumnName={getColumnName}
        onAddColumn={handleAddColumn}
        onEnableColumn={handleEnableColumn}
        onDisableColumn={handleDisableColumn}
        onDragColumn={handleDragColumn}
        onShowWidget={onShowWidget}
      />
    </>
  );
};
