/* eslint-disable react/prop-types */
import React, { useRef } from "react";
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
  const settingsRef = useRef(null);

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
          ref={settingsRef}
          onClick={() => {
            onShowWidget(
              {
                id: "column_settings",
                props: {
                  initialKey: columnKey,
                },
              },
              settingsRef.current,
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
