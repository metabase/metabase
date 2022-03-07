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
import { StaticChartProps } from "./types";

const StaticChart = ({ type, options }: StaticChartProps) => {
  switch (type) {
    case CATEGORICAL_AREA_CHART_TYPE:
      return <CategoricalAreaChart {...options} />;
    case CATEGORICAL_BAR_CHART_TYPE:
      return <CategoricalBarChart {...options} />;
    case CATEGORICAL_DONUT_CHART_TYPE:
      return <CategoricalDonutChart {...options} />;
    case CATEGORICAL_LINE_CHART_TYPE:
      return <CategoricalLineChart {...options} />;
    case CATEGORICAL_WATERFALL_CHART_TYPE:
      return <CategoricalWaterfallChart {...options} />;
    case TIME_SERIES_AREA_CHART_TYPE:
      return <TimeSeriesAreaChart {...options} />;
    case TIME_SERIES_BAR_CHART_TYPE:
      return <TimeSeriesBarChart {...options} />;
    case TIME_SERIES_LINE_CHART_TYPE:
      return <TimeSeriesLineChart {...options} />;
    case TIME_SERIES_WATERFALL_CHART_TYPE:
      return <TimeSeriesWaterfallChart {...options} />;
    case PROGRESS_BAR_TYPE:
      return <ProgressBar {...options} />;
    case LINE_AREA_BAR_CHART_TYPE:
      return <LineAreaBarChart {...options} />;
    case FUNNEL_CHART_TYPE:
      return <Funnel {...options} />;
  }
};

export default StaticChart;
