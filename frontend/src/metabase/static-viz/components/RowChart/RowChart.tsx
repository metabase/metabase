import { Group } from "@visx/group";

import {
  getColumnValueStaticFormatter,
  getLabelsStaticFormatter,
  getStaticFormatters,
} from "metabase/static-viz/lib/format";
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
import type {
  ColorGetter,
  RemappingHydratedChartData,
} from "metabase/visualizations/types";
import {
  getAxesVisibility,
  getLabelledSeries,
  getXValueRange,
} from "metabase/visualizations/visualizations/RowChart/utils/settings";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import { Legend } from "../Legend";
import { calculateLegendRows } from "../Legend/utils";

import { getStaticChartTheme } from "./theme";
import { getChartLabels } from "./utils/labels";

const CHART_PADDING = 16;
const LEGEND_FONT = {
  lineHeight: 20,
  size: 14,
  weight: 700,
};

const WIDTH = 620;
const HEIGHT = 440;

export interface StaticRowChartProps {
  data: DatasetData;
  settings: VisualizationSettings;
  getColor: ColorGetter;
}

const staticTextMeasurer: TextWidthMeasurer = (
  text: string,
  style: FontStyle,
) =>
  measureTextWidth(
    text,
    parseInt(style.size.toString(), 10),
    style.weight ? parseInt(style.weight.toString(), 10) : 400,
  );

const StaticRowChart = ({ data, settings, getColor }: StaticRowChartProps) => {
  const remappedColumnsData = extractRemappedColumns(
    data,
  ) as RemappingHydratedChartData;
  const columnValueFormatter = getColumnValueStaticFormatter();

  const { chartColumns, series, seriesColors } = getTwoDimensionalChartSeries(
    remappedColumnsData,
    settings,
    columnValueFormatter,
  );
  const groupedData = getGroupedDataset(
    remappedColumnsData.rows,
    chartColumns,
    settings,
    columnValueFormatter,
  );
  const labelsFormatter = getLabelsStaticFormatter(chartColumns, settings);
  const goal = getChartGoal(settings);
  const theme = getStaticChartTheme(getColor);
  const stackOffset = getStackOffset(settings);

  const tickFormatters = getStaticFormatters(chartColumns, settings);

  const { xLabel, yLabel } = getChartLabels(chartColumns, settings);
  const { hasXAxis, hasYAxis } = getAxesVisibility(settings);
  const xValueRange = getXValueRange(settings);
  const labelledSeries = getLabelledSeries(settings, series);

  const legend = calculateLegendRows({
    items: series.map(series => ({
      key: series.seriesKey,
      name: series.seriesName,
      color: seriesColors[series.seriesKey],
    })),
    width: WIDTH,
    lineHeight: LEGEND_FONT.lineHeight,
    fontSize: LEGEND_FONT.size,
    fontWeight: LEGEND_FONT.weight,
  });

  const legendHeight = legend != null ? legend.height + CHART_PADDING : 0;
  const fullChartHeight = HEIGHT + legendHeight;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={WIDTH}
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
          width={WIDTH}
          height={HEIGHT}
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
    </svg>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticRowChart;
