import { t } from "ttag";
import { useCallback } from "react";
import type { DatasetColumn } from "metabase-types/api";
import { getEditWidgetConfig } from "metabase/visualizations/components/settings/ChartSettingTableColumns/utils";
import { getColumnIcon } from "metabase/common/utils/columns";
import { Icon } from "metabase/core/components/Icon";
import { ColumnItem } from "../ColumnItem";
import { ChartSettingOrderedItems } from "../ChartSettingOrderedItems";
import { TableColumnSelectorRoot } from "./TableColumnSelector.styled";
import type {
  ColumnGroupItem,
  ColumnMetadataItem,
  ColumnSettingItem,
  DragColumnProps,
  EditWidgetConfig,
} from "./types";

interface TableColumnSelectorProps {
  enabledColumnItems: ColumnSettingItem[];
  disabledColumnItems: ColumnSettingItem[];
  additionalColumnGroups?: ColumnGroupItem[];
  getColumnName: (column: DatasetColumn) => string | Element;
  onAddColumn?: (columnItem: ColumnMetadataItem) => void;
  onEnableColumn: (columnItem: ColumnSettingItem) => void;
  onDisableColumn: (columnItem: ColumnSettingItem) => void;
  onDragColumn: (props: DragColumnProps) => void;
  onShowWidget: (config: EditWidgetConfig, targetElement: HTMLElement) => void;
}

export const TableColumnSelector = ({
  enabledColumnItems,
  disabledColumnItems,
  additionalColumnGroups = [],
  getColumnName,
  onAddColumn,
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
    <TableColumnSelectorRoot role="list">
      {enabledColumnItems.length > 0 ? (
        <div role="group" data-testid="visible-columns">
          <ChartSettingOrderedItems
            items={enabledColumnItems}
            getItemName={({ datasetColumn, metadataColumn }) => (
              <>
                <Icon name={getColumnIcon(metadataColumn)} />{" "}
                {getColumnName(datasetColumn)}
              </>
            )}
            distance={5}
            onEdit={handleEditColumn}
            onRemove={onDisableColumn}
            onEnable={onEnableColumn}
            onSortEnd={onDragColumn}
          />
        </div>
      ) : (
        <div className="my2 p2 flex layout-centered bg-grey-0 text-light text-bold rounded">
          {t`Add fields from the list below`}
        </div>
      )}
      {(disabledColumnItems.length > 0 ||
        additionalColumnGroups.length > 0) && (
        <h4 className="mb2 mt4 pt4 border-top">{t`More columns`}</h4>
      )}
      <div data-testid="disabled-columns">
        {disabledColumnItems.map((columnItem, columnIndex) => (
          <ColumnItem
            key={columnIndex}
            title={getColumnName(columnItem.datasetColumn)}
            role="listitem"
            onAdd={() => onEnableColumn(columnItem)}
          />
        ))}
      </div>
      <div data-testid="additional-columns">
        {additionalColumnGroups.map((groupItem, groupIndex) => (
          <div key={groupIndex}>
            {groupItem.isJoinable && (
              <div className="my2 text-medium text-bold text-uppercase text-small">
                {groupItem.displayName}
              </div>
            )}
            {groupItem.columns.map((columnItem, columnIndex) => (
              <ColumnItem
                key={columnIndex}
                title={columnItem.displayName}
                role="listitem"
                onAdd={() => onAddColumn?.(columnItem)}
              />
            ))}
          </div>
        ))}
      </div>
    </TableColumnSelectorRoot>
  );
};
