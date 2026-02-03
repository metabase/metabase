import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import { Radio } from "metabase/common/components/Radio";
import CS from "metabase/css/core/index.css";
import { Stack } from "metabase/ui";
import { updateSeriesColor } from "metabase/visualizations/lib/series";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

import ChartSettingsWidgetList from "../../ChartSettingsWidgetList";
import { ChartSettingsWidgetPopover } from "../../ChartSettingsWidgetPopover";
import type { Widget } from "../types";

import {
  ChartSettingsListContainer,
  SectionContainer,
} from "./BaseChartSettings.styled";
import { useChartSettingsSections } from "./hooks";
import type { BaseChartSettingsProps } from "./types";

export const BaseChartSettings = ({
  initial,
  series,
  computedSettings = {},
  onChange,
  question,
  widgets,
  chartSettings,
  transformedSeries,
  className,
  ...stackProps
}: BaseChartSettingsProps) => {
  const {
    chartSettingCurrentSection,
    currentSectionHasColumnSettings,
    sectionNames,
    setCurrentSection,
    showSectionPicker,
    visibleWidgets,
  } = useChartSettingsSections({
    initial,
    widgets,
  });
  const [currentWidget, setCurrentWidget] = useState<Widget | null>(
    initial?.widget ?? null,
  );
  const [popoverRef, setPopoverRef] = useState<HTMLElement | null>();

  const columnHasSettings = useCallback(
    (col: DatasetColumn) => {
      const settings = chartSettings || {};
      const settingsDefs = getSettingDefinitionsForColumn(series, col);
      const getComputedSettingsResult = getComputedSettings(
        settingsDefs,
        col,
        settings,
      );

      return getSettingsWidgets(
        settingsDefs,
        settings,
        getComputedSettingsResult,
        col,
        _.noop,
        {
          series: series,
        },
      ).some((widget) => !widget.hidden);
    },
    [chartSettings, series],
  );

  const styleWidget = useMemo(() => {
    const seriesSettingsWidget =
      currentWidget &&
      widgets.find((widget) => widget.id === "series_settings");

    const display = transformedSeries?.[0]?.card?.display;
    // In the pie the chart, clicking on the "measure" settings menu will only
    // open a formatting widget, and we don't want the style widget (used only
    // for dimension) to override that
    if (display === "pie" && currentWidget?.id === "column_settings") {
      return null;
    }

    // We don't want to show series settings widget for waterfall charts
    if (display === "waterfall" || !seriesSettingsWidget) {
      return null;
    }

    if (currentWidget.props?.seriesKey !== undefined) {
      return {
        ...seriesSettingsWidget,
        props: {
          ...seriesSettingsWidget.props,
          initialKey: currentWidget.props.seriesKey,
        },
      };
    } else if (currentWidget.props?.initialKey) {
      const hasBreakouts =
        computedSettings["graph.dimensions"] &&
        computedSettings["graph.dimensions"].length > 1;

      if (hasBreakouts) {
        return null;
      }

      const singleSeriesForColumn = transformedSeries?.find((single) => {
        const metricColumn = single.data.cols[1];
        if (metricColumn) {
          return (
            getColumnKey(metricColumn) === currentWidget?.props?.initialKey
          );
        }
      });

      if (singleSeriesForColumn) {
        return {
          ...seriesSettingsWidget,
          props: {
            ...seriesSettingsWidget.props,
            initialKey: keyForSingleSeries(singleSeriesForColumn),
          },
        };
      }
    }

    return null;
  }, [computedSettings, currentWidget, transformedSeries, widgets]);

  const formattingWidget = useMemo(() => {
    const widget =
      currentWidget && widgets.find((widget) => widget.id === currentWidget.id);

    if (widget) {
      return { ...widget, props: { ...widget.props, ...currentWidget.props } };
    }

    return null;
  }, [currentWidget, widgets]);

  const handleShowSection = useCallback(
    (section: string | null) => {
      if (section) {
        setCurrentSection(section);
        setCurrentWidget(null);
      }
    },
    [setCurrentSection],
  );

  // allows a widget to temporarily replace itself with a different widget
  const handleShowWidget = useCallback(
    (widget: Widget, ref: HTMLElement | null) => {
      setPopoverRef(ref);
      setCurrentWidget(widget);
    },
    [],
  );

  // go back to previously selected section
  const handleEndShowWidget = useCallback(() => {
    setPopoverRef(null);
    setCurrentWidget(null);
  }, []);

  const handleChangeSeriesColor = useCallback(
    (seriesKey: string, color: string) => {
      if (chartSettings) {
        onChange?.(updateSeriesColor(chartSettings, seriesKey, color));
      }
    },
    [chartSettings, onChange],
  );

  const extraWidgetProps = {
    // NOTE: special props to support adding additional fields
    question,
    onShowWidget: handleShowWidget,
    onEndShowWidget: handleEndShowWidget,
    currentSectionHasColumnSettings,
    columnHasSettings,
    onChangeSeriesColor: handleChangeSeriesColor,
  };

  return (
    <>
      <Stack
        data-testid="chartsettings-sidebar"
        h="100%"
        gap={0}
        className={cx(CS.overflowHidden, className)}
        {...stackProps}
      >
        {showSectionPicker && (
          <SectionContainer>
            <Radio
              value={chartSettingCurrentSection ?? undefined}
              onChange={handleShowSection}
              options={sectionNames}
              optionNameFn={(v) => v}
              optionValueFn={(v) => v}
              optionKeyFn={(v) => v}
              variant="underlined"
            />
          </SectionContainer>
        )}
        <ChartSettingsListContainer data-testid="chartsettings-list-container">
          <ChartSettingsWidgetList
            widgets={visibleWidgets}
            extraWidgetProps={extraWidgetProps}
          />
        </ChartSettingsListContainer>
      </Stack>
      <ChartSettingsWidgetPopover
        anchor={popoverRef as HTMLElement}
        widgets={[styleWidget, formattingWidget].filter(
          (widget): widget is Widget => !!widget,
        )}
        handleEndShowWidget={handleEndShowWidget}
      />
    </>
  );
};
