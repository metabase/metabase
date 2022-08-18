import React from "react";
import CategoricalAreaChart from "../../components/CategoricalAreaChart";
import { CATEGORICAL_AREA_CHART_TYPE } from "../../components/CategoricalAreaChart/constants";
import CategoricalBarChart from "../../components/CategoricalBarChart";
import { CATEGORICAL_BAR_CHART_TYPE } from "../../components/CategoricalBarChart/constants";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import { CATEGORICAL_DONUT_CHART_TYPE } from "../../components/CategoricalDonutChart/constants";
import CategoricalLineChart from "../../components/CategoricalLineChart";
import { CATEGORICAL_LINE_CHART_TYPE } from "../../components/CategoricalLineChart/constants";
import CategoricalWaterfallChart from "../../components/CategoricalWaterfallChart";
import { CATEGORICAL_WATERFALL_CHART_TYPE } from "../../components/CategoricalWaterfallChart/constants";
import TimeSeriesAreaChart from "../../components/TimeSeriesAreaChart";
import { TIME_SERIES_AREA_CHART_TYPE } from "../../components/TimeSeriesAreaChart/constants";
import TimeSeriesBarChart from "../../components/TimeSeriesBarChart";
import { TIME_SERIES_BAR_CHART_TYPE } from "../../components/TimeSeriesBarChart/constants";
import TimeSeriesLineChart from "../../components/TimeSeriesLineChart";
import { TIME_SERIES_LINE_CHART_TYPE } from "../../components/TimeSeriesLineChart/constants";
import TimeSeriesWaterfallChart from "../../components/TimeSeriesWaterfallChart";
import { TIME_SERIES_WATERFALL_CHART_TYPE } from "../../components/TimeSeriesWaterfallChart/constants";
import ProgressBar from "../../components/ProgressBar";
import { PROGRESS_BAR_TYPE } from "../../components/ProgressBar/constants";
import LineAreaBarChart from "../../components/LineAreaBarChart";
import { LINE_AREA_BAR_CHART_TYPE } from "../../components/LineAreaBarChart/constants";
import Funnel from "../../components/FunnelChart";
import { FUNNEL_CHART_TYPE } from "../../components/FunnelChart/constants";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { StaticChartProps } from "./types";

const StaticChart = ({ type, options }: StaticChartProps) => {
  const getColor = createColorGetter(options.colors);
  const chartProps = { ...options, getColor };

  switch (type) {
    case CATEGORICAL_AREA_CHART_TYPE:
      return <CategoricalAreaChart {...chartProps} />;
    case CATEGORICAL_BAR_CHART_TYPE:
      return <CategoricalBarChart {...chartProps} />;
    case CATEGORICAL_DONUT_CHART_TYPE:
      return <CategoricalDonutChart {...chartProps} />;
    case CATEGORICAL_LINE_CHART_TYPE:
      return <CategoricalLineChart {...chartProps} />;
    case CATEGORICAL_WATERFALL_CHART_TYPE:
      return <CategoricalWaterfallChart {...chartProps} />;
    case TIME_SERIES_AREA_CHART_TYPE:
      return <TimeSeriesAreaChart {...chartProps} />;
    case TIME_SERIES_BAR_CHART_TYPE:
      return <TimeSeriesBarChart {...chartProps} />;
    case TIME_SERIES_LINE_CHART_TYPE:
      return <TimeSeriesLineChart {...chartProps} />;
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
