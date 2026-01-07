import { Group } from "@visx/group";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { extractRemappedColumns } from "metabase/visualizations";
import { getChartGoal } from "metabase/visualizations/lib/settings/goal";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import { RowChart } from "metabase/visualizations/shared/components/RowChart";
import type {
  FontStyle,
  TextWidthMeasurer,
} from "metabase/visualizations/shared/types/measure-text";
import {
  getGroupedDataset,
  trimData,
} from "metabase/visualizations/shared/utils/data";
import { getTwoDimensionalChartSeries } from "metabase/visualizations/shared/utils/series";
import type { RemappingHydratedChartData } from "metabase/visualizations/types";
import {
  getColumnValueFormatter,
  getFormatters,
  getLabelsFormatter,
} from "metabase/visualizations/visualizations/RowChart/utils/format";
import { getLegendItems } from "metabase/visualizations/visualizations/RowChart/utils/legend";
import {
  getAxesVisibility,
  getLabelledSeries,
  getLabels,
  getXValueRange,
} from "metabase/visualizations/visualizations/RowChart/utils/settings";

import Watermark from "../../watermark.svg?component";
import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

import { getStaticChartTheme } from "./theme";

const CHART_PADDING = 16;
const LEGEND_FONT = {
  lineHeight: 20,
  size: 14,
  weight: 700,
};

const WIDTH = 620;
const HEIGHT = 440;

const staticTextMeasurer: TextWidthMeasurer = (
  text: string,
  style: FontStyle,
) =>
  measureTextWidth(
    text,
    parseInt(style.size.toString(), 10),
    style.weight ? parseInt(style.weight.toString(), 10) : 400,
  );

export const StaticRowChart = ({
  rawSeries,
  settings,
  renderingContext,
  width = WIDTH,
  height = HEIGHT,
  hasDevWatermark = false,
}: StaticChartProps) => {
  const data = extractRemappedColumns(
    rawSeries[0].data,
  ) as RemappingHydratedChartData;
  const { getColor } = renderingContext;
  const columnValueFormatter = getColumnValueFormatter();

  const { chartColumns, series, seriesColors } = getTwoDimensionalChartSeries(
    data,
    settings,
    columnValueFormatter,
  );
  const groupedData = getGroupedDataset(
    data.rows,
    chartColumns,
    settings,
    columnValueFormatter,
  );
  const labelsFormatter = getLabelsFormatter(chartColumns, settings);
  const goal = getChartGoal(settings);
  const theme = getStaticChartTheme(getColor);
  const stackOffset = getStackOffset(settings);

  const tickFormatters = getFormatters(chartColumns, settings);

  const { xLabel, yLabel } = getLabels(settings);

  const { hasXAxis, hasYAxis } = getAxesVisibility(settings);
  const xValueRange = getXValueRange(settings);
  const labelledSeries = getLabelledSeries(settings, series);

  const legendItems = getLegendItems(series, seriesColors);
  const legend = calculateLegendRows({
    items: legendItems,
    width,
    lineHeight: LEGEND_FONT.lineHeight,
    fontSize: LEGEND_FONT.size,
    fontWeight: LEGEND_FONT.weight,
  });

  const legendHeight = legend != null ? legend.height + CHART_PADDING : 0;
  const fullChartHeight = height + legendHeight;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={fullChartHeight}
      fontFamily="Lato"
    >
      {legend.items.length > 0 && (
        <Legend
          items={legend.items}
          top={CHART_PADDING}
          fontSize={LEGEND_FONT.size}
          fontWeight={LEGEND_FONT.weight}
        />
      )}
      <Group top={legendHeight}>
        <RowChart
          width={width}
          height={height}
          data={groupedData}
          trimData={trimData}
          series={series}
          seriesColors={seriesColors}
          goal={goal}
          theme={theme}
          stackOffset={stackOffset}
          tickFormatters={tickFormatters}
          labelsFormatter={labelsFormatter}
          measureTextWidth={staticTextMeasurer}
          xLabel={xLabel}
          yLabel={yLabel}
          hasXAxis={hasXAxis}
          hasYAxis={hasYAxis}
          xScaleType={settings["graph.y_axis.scale"]}
          xValueRange={xValueRange}
          labelledSeries={labelledSeries}
        />
      </Group>
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={fullChartHeight}
          width={width}
          preserveAspectRatio="xMinYMin slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
};
