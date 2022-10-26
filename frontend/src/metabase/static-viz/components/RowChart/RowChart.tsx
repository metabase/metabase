import React, { useMemo } from "react";
import { RowChart } from "metabase/visualizations/shared/components/RowChart";
import {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";
import { measureText } from "metabase/static-viz/lib/text";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import {
  getGroupedDataset,
  trimData,
} from "metabase/visualizations/shared/utils/data";
import { getChartGoal } from "metabase/visualizations/lib/settings/goal";
import { VisualizationSettings } from "metabase-types/api";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { TwoDimensionalChartData } from "metabase/visualizations/shared/types/data";
import { getTwoDimensionalChartSeries } from "metabase/visualizations/shared/utils/series";
import {
  getAxesVisibility,
  getXValueRange,
} from "metabase/visualizations/visualizations/RowChart/utils/settings";
import {
  getLabelsFormatter,
  getStaticColumnValueFormatter,
  getStaticFormatters,
} from "./utils/format";
import { getStaticChartTheme } from "./theme";
import { getChartLabels } from "./utils/labels";

const WIDTH = 620;
const HEIGHT = 440;

interface StaticRowChartProps {
  data: TwoDimensionalChartData;
  settings: VisualizationSettings;
  getColor: ColorGetter;
}

const staticTextMeasurer: TextMeasurer = (text: string, style: FontStyle) =>
  measureText(
    text,
    parseInt(style.size.toString(), 10),
    style.weight ? parseInt(style.weight.toString(), 10) : 400,
  );

const StaticRowChart = ({ data, settings, getColor }: StaticRowChartProps) => {
  const columnValueFormatter = getStaticColumnValueFormatter();
  const labelsFormatter = getLabelsFormatter();
  const { chartColumns, series, seriesColors } = getTwoDimensionalChartSeries(
    data,
    settings,
    columnValueFormatter,
  );
  const groupedData = getGroupedDataset(
    data,
    chartColumns,
    columnValueFormatter,
  );
  const goal = getChartGoal(settings);
  const theme = getStaticChartTheme(getColor);
  const stackOffset = getStackOffset(settings);

  const tickFormatters = getStaticFormatters(chartColumns, settings);

  const { xLabel, yLabel } = getChartLabels(chartColumns, settings);
  const { hasXAxis, hasYAxis } = getAxesVisibility(settings);
  const xValueRange = getXValueRange(settings);

  return (
    <svg width={WIDTH} height={HEIGHT} fontFamily="Lato">
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
        measureText={staticTextMeasurer}
        xLabel={xLabel}
        yLabel={yLabel}
        hasXAxis={hasXAxis}
        hasYAxis={hasYAxis}
        xValueRange={xValueRange}
      />
    </svg>
  );
};

export default StaticRowChart;
