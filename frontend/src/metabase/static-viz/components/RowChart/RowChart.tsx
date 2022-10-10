import React, { useMemo } from "react";
import { RowChart } from "metabase/visualizations/shared/components/RowChart";
import {
  FontStyle,
  TextMeasurer,
} from "metabase/visualizations/shared/types/measure-text";
import { measureText } from "metabase/static-viz/lib/text";
import { getStackingOffset } from "metabase/visualizations/lib/settings/stacking";
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
  measureText(text, parseInt(style.size, 10), parseInt(style.weight, 10));

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
  const stackingOffset = getStackingOffset(settings);
  const shouldShowDataLabels =
    settings["graph.show_values"] && stackingOffset !== "expand";

  const tickFormatters = getStaticFormatters(chartColumns, settings);

  const { xLabel, yLabel } = getChartLabels(chartColumns, settings);

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
        stackingOffset={stackingOffset}
        shouldShowDataLabels={shouldShowDataLabels}
        tickFormatters={tickFormatters}
        labelsFormatter={labelsFormatter}
        measureText={staticTextMeasurer}
        xLabel={xLabel}
        yLabel={yLabel}
      />
    </svg>
  );
};

export default StaticRowChart;
