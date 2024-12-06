/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import {
  ChartSettingFieldPickerRoot,
  FieldPickerColorPicker,
  GrabberHandle,
  SettingsButton,
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
  autoOpenWhenUnset = true,
  fieldSettingWidget = null,
}) => {
  let columnKey;
  if (value && showColumnSetting && columns) {
    const column = _.findWhere(columns, { name: value });
    if (column && columnHasSettings(column)) {
      columnKey = getColumnKey(column);
    }
  }

  const menuWidgetInfo = useMemo(() => {
    if (columnKey && showColumnSetting) {
      return {
        id: "column_settings",
        props: {
          initialKey: columnKey,
        },
      };
    }

    if (fieldSettingWidget) {
      return {
        id: fieldSettingWidget,
      };
    }

    return null;
  }, [columnKey, fieldSettingWidget, showColumnSetting]);

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
      showDragHandle={showDragHandle}
      data-testid="chartsettings-field-picker"
    >
      {showDragHandle && <GrabberHandle name="grabber" noPointer noMargin />}
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
        isInitiallyOpen={autoOpenWhenUnset && value === undefined}
        hiddenIcons
      />
      {menuWidgetInfo && (
        <SettingsButton
          onlyIcon
          icon="ellipsis"
          onClick={e => {
            onShowWidget(menuWidgetInfo, e.target);
          }}
          data-testid={`settings-${value}`}
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
