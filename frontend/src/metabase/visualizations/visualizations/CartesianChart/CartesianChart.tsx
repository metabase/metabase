import { useCallback, useMemo, useRef } from "react";
import type { EChartsType } from "echarts";
import type * as React from "react";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRenderer,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";

import { useModelsAndOption } from "./use-models-and-option";
import { useChartDebug } from "./use-chart-debug";
import { useChartEvents } from "metabase/visualizations/visualizations/CartesianChart/use-chart-events";

export function CartesianChart(props: VisualizationProps) {
  const {
    rawSeries,
    settings,
    card,
    width,
    showTitle,
    headerIcon,
    actionButtons,
    isQueryBuilder,
    isFullscreen,
    hovered,
    onChangeCardAndRun,
    onHoverChange,
  } = props;
  const { chartModel, timelineEventsModel, option } = useModelsAndOption(props);
  useChartDebug({ isQueryBuilder, rawSeries, option });

  const chartRef = useRef<EChartsType>();

  const hasTitle = showTitle && settings["card.title"];
  const title = settings["card.title"] || card.name;
  const description = settings["card.description"];

  const legendItems = useMemo(() => getLegendItems(chartModel), [chartModel]);
  const hasLegend = legendItems.length > 1;

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const { onSelectSeries, onOpenQuestion, eventHandlers } = useChartEvents(
    chartRef,
    chartModel,
    timelineEventsModel,
    option,
    props,
  );

  const canSelectTitle = !!onChangeCardAndRun;

  return (
    <CartesianChartRoot isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <LegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          // @ts-expect-error will be fixed when LegendCaption gets converted to TypeScript
          actionButtons={actionButtons}
          onSelectTitle={canSelectTitle ? onOpenQuestion : undefined}
          width={width}
        />
      )}
      <CartesianChartLegendLayout
        hasLegend={hasLegend}
        labels={legendItems.map(item => item.name)}
        colors={legendItems.map(item => item.color)}
        actionButtons={!hasTitle ? actionButtons : undefined}
        hovered={hovered}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={onSelectSeries}
        onHoverChange={onHoverChange}
      >
        <CartesianChartRenderer
          option={option}
          eventHandlers={eventHandlers}
          onInit={handleInit}
        />
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}
