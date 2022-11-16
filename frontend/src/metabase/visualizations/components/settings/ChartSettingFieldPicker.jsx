/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import ChartSettingSelect from "./ChartSettingSelect";
import {
  SettingsIcon,
  ChartSettingFieldPickerRoot,
  FieldPickerColorPicker,
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
  showDragHandle,
  columnHasSettings,
  showColorPicker,
  colors,
  series,
  onChangeSeriesColor,
}) => {
  let columnKey;
  if (value && showColumnSetting && columns) {
    const column = _.findWhere(columns, { name: value });
    if (column && columnHasSettings(column)) {
      columnKey = getColumnKey(column);
    }
  }

  let seriesKey;
  if (series && columnKey && showColorPicker) {
    const seriesForColumn = series.find(single => {
      const metricColumn = single.data.cols[1];
      return getColumnKey(metricColumn) === columnKey;
    });
    if (seriesForColumn) {
      seriesKey = keyForSingleSeries(seriesForColumn);
    }
  }
  return (
    <ChartSettingFieldPickerRoot
      className={className}
      disabled={options.length === 1 && options[0].value === value}
      data-testid="chartsettings-field-picker"
    >
      {showDragHandle && (
        <SettingsIcon name="grabber2" size={12} noPointer noMargin />
      )}
      {showColorPicker && seriesKey && (
        <FieldPickerColorPicker
          pillSize="small"
          value={colors[seriesKey]}
          onChange={value => {
            onChangeSeriesColor(seriesKey, value);
          }}
        />
      )}
      <ChartSettingSelect
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
