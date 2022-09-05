/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";
import { keyForColumn } from "metabase/lib/dataset";
import ChartSettingSelect from "./ChartSettingSelect";
import {
  SettingsIcon,
  ChartSettingFieldPickerRoot,
} from "./ChartSettingFieldPicker.styled";

const ChartSettingFieldPicker = ({
  value,
  options,
  onChange,
  onRemove,
  onShowWidget,
  className,
  columns,
  showColumnSetting,
}) => {
  let columnKey;
  if (value && showColumnSetting && columns) {
    const column = _.findWhere(columns, { name: value });
    if (column) {
      columnKey = keyForColumn(column);
    }
  }
  return (
    <ChartSettingFieldPickerRoot className={className}>
      <ChartSettingSelect
        className="flex-full"
        value={value}
        options={options}
        onChange={onChange}
        placeholder={t`Select a field`}
        placeholderNoOptions={t`No valid fields`}
        isInitiallyOpen={value === undefined}
        hiddenIcons
      />
      {columnKey && (
        <SettingsIcon
          name="ellipsis"
          onClick={e => {
            onShowWidget(
              {
                id: "column_settings",
                props: {
                  initialKey: columnKey,
                },
              },
              e.target,
            );
          }}
        />
      )}
      {onRemove && (
        <SettingsIcon
          data-testid={`remove-${value}`}
          name="close"
          onClick={onRemove}
        />
      )}
    </ChartSettingFieldPickerRoot>
  );
};

export default ChartSettingFieldPicker;
