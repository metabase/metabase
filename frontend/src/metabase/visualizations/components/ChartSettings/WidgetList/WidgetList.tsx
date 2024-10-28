import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import ChartSettingsWidgetList from "metabase/visualizations/components/ChartSettingsWidgetList";
import ChartSettingsWidgetPopover from "metabase/visualizations/components/ChartSettingsWidgetPopover";
import { updateSeriesColor } from "metabase/visualizations/lib/series";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

import type { Widget, WidgetListProps } from "../types";

import { ChartSettingsListContainer } from "./WidgetList.styled";

export const WidgetList = ({
  chartSettings,
  series,
  onChange,
  widgets,
  visibleWidgets,
  question,
  computedSettings: propComputedSettings,
  setCurrentWidget,
  transformedSeries,
  currentWidget,
}: WidgetListProps) => {
  const [popoverRef, setPopoverRef] = useState<HTMLElement | null>();

  const computedSettings = useMemo(
    () => propComputedSettings || {},
    [propComputedSettings],
  );

  // allows a widget to temporarily replace itself with a different widget
  const handleShowWidget = useCallback(
    (widget: Widget, ref: HTMLElement | null) => {
      setPopoverRef(ref);
      setCurrentWidget(widget);
    },
    [setCurrentWidget],
  );

  // go back to previously selected section
  const handleEndShowWidget = useCallback(() => {
    setPopoverRef(null);
    setCurrentWidget(null);
  }, [setCurrentWidget]);

  const styleWidget = useMemo(() => {
    const seriesSettingsWidget =
      currentWidget && widgets.find(widget => widget.id === "series_settings");

    const display = transformedSeries?.[0]?.card?.display;
    // In the pie the chart, clicking on the "measure" settings menu will only
    // open a formatting widget, and we don't want the style widget (used only
    // for dimension) to override that
    if (display === "pie" && currentWidget?.id === "column_settings") {
      return null;
    }

    //We don't want to show series settings widget for waterfall charts
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

      const singleSeriesForColumn = transformedSeries.find(single => {
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
      currentWidget && widgets.find(widget => widget.id === currentWidget.id);

    if (widget) {
      return { ...widget, props: { ...widget.props, ...currentWidget.props } };
    }

    return null;
  }, [currentWidget, widgets]);

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
          series,
        },
      ).some(widget => !widget.hidden);
    },
    [chartSettings, series],
  );

  const handleChangeSeriesColor = useCallback(
    (seriesKey: string, color: string) => {
      onChange?.(updateSeriesColor(chartSettings, seriesKey, color));
    },
    [chartSettings, onChange],
  );

  return (
    <>
      <ChartSettingsListContainer className={CS.scrollShow}>
        <ChartSettingsWidgetList
          widgets={visibleWidgets}
          extraWidgetProps={{
            // NOTE: special props to support adding additional fields
            question,
            onShowWidget: handleShowWidget,
            onEndShowWidget: handleEndShowWidget,
            columnHasSettings,
            onChangeSeriesColor: handleChangeSeriesColor,
          }}
        />
        <ChartSettingsWidgetPopover
          anchor={popoverRef as HTMLElement}
          widgets={[styleWidget, formattingWidget].filter(
            (widget): widget is Widget => !!widget,
          )}
          handleEndShowWidget={handleEndShowWidget}
        />
      </ChartSettingsListContainer>
    </>
  );
};
