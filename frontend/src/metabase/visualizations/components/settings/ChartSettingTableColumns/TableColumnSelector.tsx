import { useCallback } from "react";
import { getEditWidgetConfig } from "metabase/visualizations/components/settings/ChartSettingTableColumns/utils";
import { ChartSettingOrderedItems } from "../ChartSettingOrderedItems";
import { TableColumnSelectorRoot } from "./TableColumnSelector.styled";
import type {
  ColumnSettingItem,
  DragColumnProps,
  EditWidgetConfig,
} from "./types";

interface TableColumnSelectorProps {
  columnItems: ColumnSettingItem[];
  getColumnName: (columnItem: ColumnSettingItem) => string;
  onEnableColumn: (columnItem: ColumnSettingItem) => void;
  onDisableColumn: (columnItem: ColumnSettingItem) => void;
  onDragColumn: (props: DragColumnProps) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
}

export const TableColumnSelector = ({
  columnItems,
  getColumnName,
  onEnableColumn,
  onDisableColumn,
  onDragColumn,
  onShowWidget,
}: TableColumnSelectorProps) => {
  const handleEditColumn = useCallback(
    (columnItem: ColumnSettingItem, targetElement: HTMLElement) => {
      const config = getEditWidgetConfig(columnItem);
      if (config) {
        onShowWidget(config, targetElement);
      }
    },
    [onShowWidget],
  );

  return (
    <TableColumnSelectorRoot
      role="list"
      aria-label="chart-settings-table-columns"
    >
      {columnItems.length > 0 && (
        <div role="group" data-testid="visible-columns">
          <ChartSettingOrderedItems
            items={columnItems}
            getItemName={getColumnName}
            distance={5}
            onEdit={handleEditColumn}
            onRemove={onDisableColumn}
            onEnable={onEnableColumn}
            onSortEnd={onDragColumn}
          />
        </div>
      )}
    </TableColumnSelectorRoot>
  );
};
