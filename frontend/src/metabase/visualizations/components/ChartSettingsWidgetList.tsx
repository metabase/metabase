import { useCallback, useMemo } from "react";
import _ from "underscore";

import type { Widget } from "metabase/visualizations/components/ChartSettings/types";
import { updateSeriesColor } from "metabase/visualizations/lib/series";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  DatasetColumn,
  RawSeries,
  Series,
  TransformedSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { ChartSettingsSidebarWidget } from "./ChartSettingsSidebarWidget";
import type { ExtraWidgetProps } from "./ChartSettingsWidget";
import {
  ChartSettingsWidgetListDivider,
  ChartSettingsWidgetListHeader,
} from "./ChartSettingsWidgetList.styled";

type ChartSettingsWidgetListProps = {
  series: Series;
  widgets: Widget[];
  visibleWidgets: Widget[];
  computedSettings: ComputedVisualizationSettings;
  currentWidget: Widget | null;
  transformedSeries: RawSeries | TransformedSeries | undefined;
  setCurrentWidget: (widget: Widget | null) => void;
  chartSettings?: VisualizationSettings;
  onChange?: (settings: VisualizationSettings, question?: Question) => void;
} & ExtraWidgetProps;

const ChartSettingsWidgetList = ({
  widgets,
  visibleWidgets,
  computedSettings,
  currentWidget,
  transformedSeries,
  question,
  setCurrentWidget,
  chartSettings,
  onChange,
  series,
}: ChartSettingsWidgetListProps) => {
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
      ).some(widget => !widget.hidden);
    },
    [chartSettings, series],
  );

  const onChangeSeriesColor = useCallback(
    (seriesKey: string, color: string) => {
      if (chartSettings) {
        onChange?.(updateSeriesColor(chartSettings, seriesKey, color));
      }
    },
    [chartSettings, onChange],
  );

  // allows a widget to temporarily replace itself with a different widget
  const onShowWidget = useCallback(
    (widget: Widget) => {
      setCurrentWidget(widget);
    },
    [setCurrentWidget],
  );

  // go back to previously selected section
  const onEndShowWidget = useCallback(() => {
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

      const singleSeriesForColumn = transformedSeries?.find(single => {
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

  const widgetsAreGrouped = visibleWidgets.some(widget => widget.group);

  if (!widgetsAreGrouped) {
    return (
      <>
        {visibleWidgets.map(widget => (
          <ChartSettingsSidebarWidget
            key={widget.id}
            {...widget}
            question={question}
            onShowWidget={onShowWidget}
            onEndShowWidget={onEndShowWidget}
            columnHasSettings={columnHasSettings}
            onChangeSeriesColor={onChangeSeriesColor}
            styleWidget={styleWidget}
            formattingWidget={formattingWidget}
          />
        ))}
      </>
    );
  } else {
    const groupedWidgets = visibleWidgets.reduce<Record<string, any[]>>(
      (memo, widget) => {
        const group = widget.group || "";
        (memo[group] = memo[group] || []).push(widget);
        return memo;
      },
      {},
    );

    return (
      <>
        {Object.keys(groupedWidgets).map((group, groupIndex, groups) => {
          const lastGroup = groupIndex === groups.length - 1;
          return (
            <div key={`group-${groupIndex}`}>
              {group && (
                <ChartSettingsWidgetListHeader>
                  {group}
                </ChartSettingsWidgetListHeader>
              )}
              <div>
                {_.sortBy(groupedWidgets[group], "index").map(widget => (
                  <ChartSettingsSidebarWidget
                    key={widget.id}
                    {...widget}
                    question={question}
                    onShowWidget={onShowWidget}
                    onEndShowWidget={onEndShowWidget}
                    columnHasSettings={columnHasSettings}
                    onChangeSeriesColor={onChangeSeriesColor}
                    styleWidget={styleWidget}
                    formattingWidget={formattingWidget}
                  />
                ))}
                {!lastGroup && <ChartSettingsWidgetListDivider />}
              </div>
            </div>
          );
        })}
      </>
    );
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetList;
