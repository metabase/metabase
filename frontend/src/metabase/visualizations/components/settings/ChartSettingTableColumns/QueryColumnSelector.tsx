import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { Button } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type {
  DatasetColumn,
  TableColumnOrderSetting,
} from "metabase-types/api";
import type * as Lib from "metabase-lib";
import { getColumnIcon } from "metabase/common/utils/columns";
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
        onClick={() => handleWidgetOverride("table.columnVisibility")}
        pl="0"
      >{t`Add or remove columns`}</Button>
      <TableColumnSelector
        columnItems={columnItems}
        getColumnName={({ datasetColumn, metadataColumn }) => (
          <>
            {metadataColumn && <Icon name={getColumnIcon(metadataColumn)} />}{" "}
            {getColumnName(datasetColumn)}
          </>
        )}
        onEnableColumn={handleEnableColumn}
        onDisableColumn={handleDisableColumn}
        onDragColumn={handleDragColumn}
        onShowWidget={onShowWidget}
      />
    </>
  );
};
