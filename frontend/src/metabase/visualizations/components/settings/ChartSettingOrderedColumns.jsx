/* eslint-disable react/prop-types */
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { findColumnForColumnSetting } from "metabase-lib/queries/utils/dataset";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import ColumnItem from "./ColumnItem";

import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

export const ChartSettingOrderedColumns = ({
  value,
  onChange,
  question,
  columns,
  onShowWidget,
  getColumnName: _getColumnName,
}) => {
  const query = question?.query();
  const [enabledColumns, disabledColumns] = useMemo(
    () =>
      _.partition(
        value
          .map((columnSetting, index) => ({ ...columnSetting, index }))
          .filter(columnSetting =>
            findColumnForColumnSetting(columns, columnSetting),
          ),
        columnSetting => columnSetting.enabled,
      ),
    [value, columns],
  );

  let additionalFieldOptions = { count: 0 };
  if (columns && query instanceof StructuredQuery) {
    additionalFieldOptions = query.fieldsOptions(dimension => {
      return !_.find(columns, column =>
        dimension.isSameBaseDimension(column.field_ref),
      );
    });
  }

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
    ({ oldIndex, newIndex }) => {
      const adjustedOldIndex = enabledColumns[oldIndex].index;
      const adjustedNewIndex = enabledColumns[newIndex].index;

      const fields = [...value];
      fields.splice(adjustedNewIndex, 0, fields.splice(adjustedOldIndex, 1)[0]);
      onChange(fields);
    },
    [value, onChange, enabledColumns],
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

  const handleAddNewField = useCallback(
    fieldRef => {
      const columnSettingIndex = value.findIndex(columnSetting =>
        _.isEqual(fieldRef, columnSetting.fieldRef),
      );

      if (columnSettingIndex >= 0) {
        const columnSettings = [...value];
        columnSettings[columnSettingIndex] = {
          ...columnSettings[columnSettingIndex],
          enabled: true,
        };
        onChange(columnSettings);
      } else {
        const columnSettings = [...value, { fieldRef, enabled: true }];
        onChange(columnSettings);
      }
    },
    [value, onChange],
  );

  const getColumnName = useCallback(
    columnSetting => {
      return _getColumnName(columnSetting) || "[Unknown]";
    },
    [_getColumnName],
  );

  return (
    <div className="list" role="list">
      {enabledColumns.length > 0 ? (
        <div role="group" title="visible-columns" data-testid="visible-columns">
          <ChartSettingOrderedItems
            items={enabledColumns}
            getItemName={getColumnName}
            onEdit={handleEdit}
            onRemove={handleDisable}
            onSortEnd={handleSortEnd}
            distance={5}
          />
        </div>
      ) : (
        <div className="my2 p2 flex layout-centered bg-grey-0 text-light text-bold rounded">
          {t`Add fields from the list below`}
        </div>
      )}
      {disabledColumns.length > 0 || additionalFieldOptions.count > 0 ? (
        <h4 className="mb2 mt4 pt4 border-top">{t`More columns`}</h4>
      ) : null}
      <div data-testid="disabled-columns">
        {disabledColumns.map((columnSetting, index) => (
          <ColumnItem
            key={index}
            title={getColumnName(columnSetting)}
            onAdd={() => handleEnable(columnSetting)}
            onClick={() => handleEnable(columnSetting)}
            role="listitem"
          />
        ))}
      </div>
      {additionalFieldOptions.count > 0 && (
        <div data-testid="additional-columns">
          {additionalFieldOptions.dimensions.map((dimension, index) => (
            <ColumnItem
              key={index}
              title={dimension.displayName()}
              onAdd={() => handleAddNewField(dimension.mbql())}
              role="listitem"
            />
          ))}
          {additionalFieldOptions.fks.map((fk, index) => (
            <div key={fk.id} >
              <div className="my2 text-medium text-bold text-uppercase text-small">
                {fk.name ||
                  (fk.field.target
                    ? fk.field.target.table.display_name
                    : fk.field.display_name)}
              </div>
              {fk.dimensions.map((dimension, index) => (
                <ColumnItem
                  key={index}
                  title={dimension.displayName()}
                  onAdd={() => handleAddNewField(dimension.mbql())}
                  role="listitem"
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
