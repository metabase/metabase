import React from "react";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import { CATEGORICAL_DONUT_CHART_TYPE } from "../../components/CategoricalDonutChart/constants";
import CategoricalWaterfallChart from "../../components/CategoricalWaterfallChart";
import { CATEGORICAL_WATERFALL_CHART_TYPE } from "../../components/CategoricalWaterfallChart/constants";
import TimeSeriesWaterfallChart from "../../components/TimeSeriesWaterfallChart";
import { TIME_SERIES_WATERFALL_CHART_TYPE } from "../../components/TimeSeriesWaterfallChart/constants";
import ProgressBar from "../../components/ProgressBar";
import { PROGRESS_BAR_TYPE } from "../../components/ProgressBar/constants";
import LineAreaBarChart from "../../components/LineAreaBarChart";
import { LINE_AREA_BAR_CHART_TYPE } from "../../components/LineAreaBarChart/constants";
import Funnel from "../../components/FunnelChart";
import { FUNNEL_CHART_TYPE } from "../../components/FunnelChart/constants";
import { StaticChartProps } from "./types";

const StaticChart = ({ type, options }: StaticChartProps) => {
  const getColor = createColorGetter(options.colors);
  const chartProps = { ...options, getColor };

  switch (type) {
    case CATEGORICAL_DONUT_CHART_TYPE:
      return <CategoricalDonutChart {...chartProps} />;
    case CATEGORICAL_WATERFALL_CHART_TYPE:
      return <CategoricalWaterfallChart {...chartProps} />;
    case TIME_SERIES_WATERFALL_CHART_TYPE:
      return <TimeSeriesWaterfallChart {...chartProps} />;
    case PROGRESS_BAR_TYPE:
      return <ProgressBar {...chartProps} />;
    case LINE_AREA_BAR_CHART_TYPE:
      return <LineAreaBarChart {...chartProps} />;
    case FUNNEL_CHART_TYPE:
      return <Funnel {...chartProps} />;
  }
};

export default StaticChart;
