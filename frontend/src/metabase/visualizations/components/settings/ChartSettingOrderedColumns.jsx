/* eslint-disable react/prop-types */
import { useCallback } from "react";
import { t } from "ttag";
import { arrayMove } from "@dnd-kit/sortable";

import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { findColumnForColumnSetting } from "metabase-lib/queries/utils/dataset";

import { ChartSettingOrderedItemsAgain } from "./ChartSettingOrderedItemsAgain";
import Dimension from "metabase-lib/Dimension";

import { SortableColumnItem } from "./ChartSettingOrderedColumns.styled";

export const ChartSettingOrderedColumns = ({
  value,
  onChange,
  metadata,
  columns,
  onShowWidget,
  getColumnName: _getColumnName,
}) => {
  const handleEnable = useCallback(
    columnSetting => {
      const columnSettings = [...value];
      const index = columnSetting.index;
      columnSettings[index] = { ...columnSettings[index], enabled: true };
      onChange(columnSettings);
    },
    [value, onChange],
  );

  const handleDisable = useCallback(
    columnSetting => {
      const columnSettings = [...value];
      const index = columnSetting.index;
      columnSettings[index] = { ...columnSettings[index], enabled: false };
      onChange(columnSettings);
    },
    [value, onChange],
  );

  const handleSortEnd = useCallback(
    event => {
      const { active, over } = event;
      if (active !== over) {
        const oldIndex = active.data.current.sortable.index;
        const newIndex = over.data.current.sortable.index;

        onChange(arrayMove(value, oldIndex, newIndex));
      }
    },
    [value, onChange],
  );

  const handleEdit = useCallback(
    (columnSetting, targetElement) => {
      const column = findColumnForColumnSetting(columns, columnSetting);
      if (column) {
        onShowWidget(
          {
            id: "column_settings",
            props: {
              initialKey: getColumnKey(column),
            },
          },
          targetElement,
        );
      }
    },
    [onShowWidget, columns],
  );

  const getColumnName = useCallback(
    columnSetting => {
      return _getColumnName(columnSetting) || "[Unknown]";
    },
    [_getColumnName],
  );

  const tableColumns = value.map((columnSetting, index) => {
    const elementProps = {
      index,
      title: getColumnName(columnSetting),
      draggable: true,
      icon: Dimension.parseMBQL(columnSetting.fieldRef, metadata)
        .field()
        .icon(),
      onEdit: targetElement => handleEdit(columnSetting, targetElement),
    };

    if (columnSetting.enabled) {
      elementProps.onRemove = () => {
        handleDisable({ ...columnSetting, index });
      };
    } else {
      elementProps.onEnable = () => handleEnable({ ...columnSetting, index });
    }

    return {
      ...columnSetting,
      id: findColumnForColumnSetting(columns, columnSetting).name,
      element: (
        <SortableColumnItem
          {...elementProps}
          disabled={!columnSetting.enabled}
        />
      ),
    };
  });

  return (
    <div className="list" role="list">
      {tableColumns.length > 0 ? (
        <div role="group" data-testid="visible-columns">
          <ChartSettingOrderedItemsAgain
            items={tableColumns}
            onSortEnd={handleSortEnd}
          />
        </div>
      ) : (
        <div className="my2 p2 flex layout-centered bg-grey-0 text-light text-bold rounded">
          {t`Add fields from the list below`}
        </div>
      )}
    </div>
  );
};
