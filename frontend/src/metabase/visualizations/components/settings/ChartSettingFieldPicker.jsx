/* eslint-disable react/prop-types */
import { t } from "ttag";
import _ from "underscore";

import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import {
  SettingsIcon,
  SettingsButton,
  ChartSettingFieldPickerRoot,
  FieldPickerColorPicker,
} from "./ChartSettingFieldPicker.styled";
import ChartSettingSelect from "./ChartSettingSelect";

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
      {showDragHandle && <SettingsIcon name="grabber" noPointer noMargin />}
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
        <SettingsButton
          onlyIcon
          icon="ellipsis"
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
        <SettingsButton
          data-testid={`remove-${value}`}
          icon="close"
          onlyIcon
          onClick={onRemove}
        />
      )}
    </ChartSettingFieldPickerRoot>
  );
};

export default ChartSettingFieldPicker;
