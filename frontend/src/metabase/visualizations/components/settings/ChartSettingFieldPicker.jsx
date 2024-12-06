/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ActionIcon, Box, Group, Icon, Select } from "metabase/ui";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import {
  ChartSettingFieldPickerRoot,
  FieldPickerColorPicker,
  GrabberHandle,
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
  const data = options.map(({ name, value }) => ({
    label: name,
    value,
  }));

  const disabled =
    data.length === 0 || (data.length === 1 && data[0].value === value);

  return (
    <ChartSettingFieldPickerRoot
      className={className}
      showDragHandle={showDragHandle}
      data-testid="chartsettings-field-picker"
      bg="bg-white"
      align="center"
    >
      <Select
        data={data}
        disabled={disabled}
        value={value}
        onChange={onChange}
        icon={
          showDragHandle || (showColorPicker && seriesKey) ? (
            <>
              {showDragHandle && (
                <GrabberHandle
                  name="grabber"
                  noMargin
                  onClick={e => e.stopPropagation()}
                  style={{ pointerEvents: "all" }}
                  width={16}
                  height={16}
                />
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
            </>
          ) : null
        }
        placeholder={
          options.length === 0 ? t`No valid fields` : t`Select a field`
        }
        px="xs"
        w="100%"
        initiallyOpened={autoOpenWhenUnset && value === undefined}
        styles={{
          input: {
            marginLeft: "0.25rem",
            textOverflow: "ellipsis",
            fontWeight: "bold",
            "&[data-disabled]": {
              backgroundColor: "var(--mb-color-bg-white) !important",
            },
            border: "none",
            lineHeight: "1rem",
          },
        }}
        iconWidth="auto"
        rightSectionWidth="auto"
        rightSection={
          <Group noWrap spacing="xs" px="xs">
            {!disabled && (
              <Box px="xs">
                <Icon name="chevrondown" />
              </Box>
            )}
            {menuWidgetInfo && (
              <ActionIcon
                data-testid={`settings-${value}`}
                onClick={e => {
                  onShowWidget(menuWidgetInfo, e.target);
                }}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            )}
            {onRemove && (
              <ActionIcon data-testid={`remove-${value}`} onClick={onRemove}>
                <Icon name="close" />
              </ActionIcon>
            )}
          </Group>
        }
      />
    </ChartSettingFieldPickerRoot>
  );
};

export default ChartSettingFieldPicker;
