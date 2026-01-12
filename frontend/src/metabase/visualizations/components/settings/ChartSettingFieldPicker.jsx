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

const RIGHT_SECTION_PADDING = 16;
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
  dragHandleRef,
  dragHandleListeners,
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
    const seriesForColumn = series.find((single) => {
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

  const hasLeftSection = showDragHandle || (showColorPicker && seriesKey);

  const rightSectionWidth =
    [!disabled, !!menuWidgetInfo, !!onRemove].filter(Boolean).length *
      RIGHT_SECTION_BUTTON_WIDTH +
    RIGHT_SECTION_PADDING;

  return (
    <ChartSettingFieldPickerRoot
      className={className}
      data-testid="chartsettings-field-picker"
      bg="background-primary"
      align="center"
    >
      <ChartSettingSelect
        pl={hasLeftSection ? "sm" : 0}
        w="100%"
        defaultDropdownOpened={autoOpenWhenUnset && value === undefined}
        options={options}
        value={value}
        onChange={onChange}
        leftSection={
          hasLeftSection ? (
            <Group wrap="nowrap" gap="xs" p="xs" ml="sm" mr="md" align="center">
              {showDragHandle && (
                <GrabberHandle
                  ref={dragHandleRef}
                  name="grabber"
                  noMargin
                  {...dragHandleListeners}
                  onClick={(e) => e.stopPropagation()}
                  c="text-secondary"
                  className={CS.pointerEventsAll}
                  data-testid="drag-handle"
                />
              )}
              {showColorPicker && seriesKey && (
                <ChartSettingColorPicker
                  pillSize="small"
                  value={colors[seriesKey]}
                  onChange={(value) => {
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
        rightSectionWidth={`${rightSectionWidth}px`}
        rightSection={
          <>
            {!disabled && (
              <ActionIcon c="text-secondary" size="sm" radius="xl" p={0}>
                <Icon name="chevrondown" />
              </ActionIcon>
            )}
            {menuWidgetInfo && (
              <ChartSettingActionIcon
                icon="ellipsis"
                data-testid={`settings-${value}`}
                onClick={(e) => onShowWidget(menuWidgetInfo, e.currentTarget)}
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
          root: {
            overflow: "visible",
            padding: "0px",
          },
          wrapper: {
            marginTop: "0px",
          },
          section: {
            backgroundColor: "unset",
            zIndex: "initial",
          },
          input: {
            marginLeft: hasLeftSection ? theme.spacing.xs : 0,
            textOverflow: "ellipsis",
            fontWeight: "bold",

            backgroundColor: disabled
              ? "var(--mb-color-background-primary)"
              : "inherit",

            border: "none",
            width: "100%",
            color: "var(--mb-color-text-primary)",
            cursor: "pointer",
            pointerEvents: "unset",
            paddingRight: `${rightSectionWidth + 8}px`,
          },
        }}
      />
    </ChartSettingFieldPickerRoot>
  );
};
