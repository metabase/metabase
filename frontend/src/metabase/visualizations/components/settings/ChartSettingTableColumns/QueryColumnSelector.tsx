import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { Button } from "metabase/ui";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import type * as Lib from "metabase-lib";
import { ChartSettingAddRemoveColumns } from "../ChartSettingAddRemoveColumns/ChartSettingAddRemoveColumns";
import { TableColumnSelector } from "./TableColumnSelector";
import {
  disableColumnInSettings,
  enableColumnInSettings,
  getColumnSettingsWithRefs,
  getMetadataColumns,
  getQueryColumnSettingItems,
  moveColumnInSettings,
} from "./utils";
import type {
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
}: QueryColumnSelectorProps) => {
  const [addRemoveColumns, setAddRemoveColumns] = useState(false);

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

  const handleEnableColumn = useCallback(
    (columnItem: ColumnSettingItem) => {
      const newSettings = enableColumnInSettings(columnSettings, columnItem);
      onChange(newSettings);
    },
    [columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: ColumnSettingItem) => {
      const newSettings = disableColumnInSettings(columnSettings, columnItem);
      onChange(newSettings);
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
    <>
      <Button
        variant="subtle"
        onClick={() => setAddRemoveColumns(value => !value)}
        pl="0"
      >
        {addRemoveColumns ? t`Done picking columns` : t`Add or remove columns`}
      </Button>
      {addRemoveColumns ? (
        <ChartSettingAddRemoveColumns
          value={value}
          onChange={onChange}
          query={query}
        />
      ) : (
        <TableColumnSelector
          columnItems={columnItems}
          getColumnName={({ datasetColumn }) => getColumnName(datasetColumn)}
          onEnableColumn={handleEnableColumn}
          onDisableColumn={handleDisableColumn}
          onDragColumn={handleDragColumn}
          onShowWidget={onShowWidget}
        />
      )}
    </>
  );
};
