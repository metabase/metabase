/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Group, Icon, useMantineTheme } from "metabase/ui";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import { ChartSettingActionIcon } from "./ChartSettingActionIcon";
import { ChartSettingColorPicker } from "./ChartSettingColorPicker";
import {
  ChartSettingFieldPickerRoot,
  GrabberHandle,
} from "./ChartSettingFieldPicker.styled";
import { ChartSettingSelect } from "./ChartSettingSelect";

const RIGHT_SECTION_BUTTON_WIDTH = 22;

export const ChartSettingFieldPicker = ({
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
  const theme = useMantineTheme();

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

  const disabled =
    options.length === 0 ||
    (options.length === 1 && options[0].value === value);

  const rightSectionWidth =
    [!disabled, !!menuWidgetInfo, !!onRemove].filter(Boolean).length *
    RIGHT_SECTION_BUTTON_WIDTH;

  return (
    <ChartSettingFieldPickerRoot
      className={className}
      showDragHandle={showDragHandle}
      data-testid="chartsettings-field-picker"
      bg="bg-white"
      align="center"
    >
      <ChartSettingSelect
        pl="sm"
        pr="xs"
        w="100%"
        isInitiallyOpen={autoOpenWhenUnset && value === undefined}
        options={options}
        value={value}
        onChange={onChange}
        icon={
          showDragHandle || (showColorPicker && seriesKey) ? (
            <Group noWrap spacing="xs" p="xs" ml="sm" align="center">
              {showDragHandle && (
                <GrabberHandle
                  name="grabber"
                  noMargin
                  onClick={e => e.stopPropagation()}
                  c="text-medium"
                  className={CS.pointerEventsAll}
                />
              )}
              {showColorPicker && seriesKey && (
                <ChartSettingColorPicker
                  pillSize="small"
                  value={colors[seriesKey]}
                  onChange={value => {
                    onChangeSeriesColor(seriesKey, value);
                  }}
                  className={CS.pointerEventsAll}
                />
              )}
            </Group>
          ) : null
        }
        placeholderNoOptions={t`No valid fields`}
        placeholder={t`Select a field`}
        iconWidth="auto"
        rightSectionWidth="auto"
        rightSection={
          <>
            {!disabled && (
              <ActionIcon c="text-medium" size="sm" radius="xl" p={0}>
                <Icon name="chevrondown" />
              </ActionIcon>
            )}
            {menuWidgetInfo && (
              <ChartSettingActionIcon
                icon="ellipsis"
                data-testid={`settings-${value}`}
                onClick={e => onShowWidget(menuWidgetInfo, e.currentTarget)}
              />
            )}
            {onRemove && (
              <ChartSettingActionIcon
                icon="close"
                data-testid={`remove-${value}`}
                onClick={onRemove}
              />
            )}
          </>
        }
        styles={{
          wrapper: {
            display: "flex",
          },
          icon: {
            position: "static",
            width: "auto",
          },
          input: {
            "&[data-with-icon]": {
              paddingLeft: 0,
            },
            marginLeft: theme.spacing.xs,
            textOverflow: "ellipsis",
            fontWeight: "bold",
            "&[data-disabled]": {
              backgroundColor: "var(--mb-color-bg-white) !important",
            },
            border: "none",
            width: "100%",
            paddingRight: `${rightSectionWidth}px`,
          },
          rightSection: {
            pointerEvents: "none",
            width: `${rightSectionWidth}px`,
            paddingRight: "0.75rem",
          },
        }}
      />
    </ChartSettingFieldPickerRoot>
  );
};
