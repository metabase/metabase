import React from "react";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { GAUGE_CHART_TYPE } from "metabase/static-viz/components/Gauge/constants";
import Gauge from "metabase/static-viz/components/Gauge";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import { CATEGORICAL_DONUT_CHART_TYPE } from "../../components/CategoricalDonutChart/constants";
import WaterfallChart from "../../components/WaterfallChart";
import { WATERFALL_CHART_TYPE } from "../../components/WaterfallChart/constants";
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
    case WATERFALL_CHART_TYPE:
      return <WaterfallChart {...chartProps} />;
    case GAUGE_CHART_TYPE:
      return <Gauge {...chartProps} />;
    case PROGRESS_BAR_TYPE:
      return <ProgressBar {...chartProps} />;
    case LINE_AREA_BAR_CHART_TYPE:
      return <LineAreaBarChart {...chartProps} />;
    case FUNNEL_CHART_TYPE:
      return <Funnel {...chartProps} />;
  }
};

export default StaticChart;
