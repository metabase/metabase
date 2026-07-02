import cx from "classnames";
import type { ComponentPropsWithoutRef, Ref } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Group, Icon } from "metabase/ui";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn, Series } from "metabase-types/api";

import { ChartSettingActionIcon } from "../ChartSettingActionIcon";
import { ChartSettingColorPicker } from "../ChartSettingColorPicker";
import { ChartSettingSelect } from "../ChartSettingSelect";

import S from "./ChartSettingFieldPicker.module.css";

const RIGHT_SECTION_PADDING = 16;
const RIGHT_SECTION_BUTTON_WIDTH = 22;

type MenuWidgetInfo = {
  id: string;
  props?: {
    initialKey: string;
  };
};

type ChartSettingFieldPickerProps = {
  autoOpenWhenUnset?: boolean;
  className?: string;
  colors?: Record<string, string>;
  columnHasSettings?: (column: DatasetColumn) => boolean;
  columns?: DatasetColumn[];
  dragHandleListeners?: Partial<ComponentPropsWithoutRef<typeof Icon>>;
  dragHandleRef?: Ref<HTMLElement>;
  fieldSettingWidget?: string | null;
  onChange?: (value: string) => void;
  onChangeSeriesColor?: (seriesKey: string, value: string) => void;
  onRemove?: () => void;
  onShowWidget?: (widget: MenuWidgetInfo, target: HTMLElement) => void;
  options?: Array<{ name: string; value: string }>;
  series?: Series;
  showColorPicker?: boolean;
  showColumnSetting?: boolean;
  showDragHandle?: boolean;
  value?: string;
};

export const ChartSettingFieldPicker = ({
  autoOpenWhenUnset = true,
  className,
  colors = {},
  columnHasSettings,
  columns,
  dragHandleListeners,
  dragHandleRef,
  fieldSettingWidget = null,
  onChange,
  onChangeSeriesColor,
  onRemove,
  onShowWidget,
  options = [],
  series,
  showColorPicker,
  showColumnSetting,
  showDragHandle,
  value,
}: ChartSettingFieldPickerProps) => {
  let columnKey: string | undefined;
  if (typeof value === "string" && showColumnSetting && columns) {
    const column = _.findWhere(columns, { name: value });
    if (column && columnHasSettings?.(column)) {
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

  const hasLeftSection = Boolean(
    showDragHandle || (showColorPicker && seriesKey),
  );

  const rightSectionWidth =
    [!disabled, !!menuWidgetInfo, !!onRemove].filter(Boolean).length *
      RIGHT_SECTION_BUTTON_WIDTH +
    RIGHT_SECTION_PADDING;

  return (
    <Group
      className={cx(S.root, className)}
      data-testid="chartsettings-field-picker"
      bg="background_page-primary"
      align="center"
    >
      <ChartSettingSelect
        variant="unstyled"
        pl={hasLeftSection ? "sm" : 0}
        w="100%"
        defaultDropdownOpened={autoOpenWhenUnset && value === undefined}
        options={options}
        value={value}
        onChange={(value) => onChange?.(String(value))}
        leftSection={
          hasLeftSection ? (
            <Group wrap="nowrap" gap="xs" p="xs" ml="sm" mr="md" align="center">
              {showDragHandle && (
                <Icon
                  ref={dragHandleRef as Ref<SVGSVGElement>}
                  name="grabber"
                  {...dragHandleListeners}
                  onClick={(e) => e.stopPropagation()}
                  c="text-secondary"
                  className={cx(S.grabberHandle, CS.pointerEventsAll)}
                  data-testid="drag-handle"
                />
              )}
              {showColorPicker && seriesKey && (
                <ChartSettingColorPicker
                  pillSize="small"
                  value={colors[seriesKey]}
                  onChange={(value) => {
                    onChangeSeriesColor?.(seriesKey, value);
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
        hasLeftSection={hasLeftSection}
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
                onClick={(e) => onShowWidget?.(menuWidgetInfo, e.currentTarget)}
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
      />
    </Group>
  );
};
