import RowChart from "metabase/static-viz/components/RowChart";
import Gauge from "metabase/static-viz/components/Gauge";
import CategoricalDonutChart from "metabase/static-viz/components/CategoricalDonutChart";
import WaterfallChart from "metabase/static-viz/components/WaterfallChart";
import ProgressBar from "metabase/static-viz/components/ProgressBar";
import LineAreaBarChart from "metabase/static-viz/components/LineAreaBarChart";
import Funnel from "metabase/static-viz/components/FunnelChart";
import type { ColorPalette } from "metabase/lib/colors/types";
import { getIsomorhpicProps } from "./utils";

export type StaticChartType =
  | "categorical/donut"
  | "progress"
  | "row"
  | "waterfall"
  | "gauge"
  | "combo-chart"
  | "funnel";

export interface StaticChartProps {
  type: StaticChartType;
  options: any;
  colors?: ColorPalette;
}

const StaticChart = ({ type, options }: StaticChartProps) => {
  const isomorphicProps = getIsomorhpicProps(options);
  const chartProps = {
    ...options,
    getColor: isomorphicProps.renderingContext.getColor,
  };

  switch (type) {
    case "categorical/donut":
      return <CategoricalDonutChart {...chartProps} />;
    case "waterfall":
      return <WaterfallChart {...chartProps} />;
    case "gauge":
      return <Gauge {...chartProps} />;
    case "row":
      return <RowChart {...chartProps} />;
    case "progress":
      return <ProgressBar {...chartProps} />;
    case "combo-chart":
      return <LineAreaBarChart {...chartProps} />;
    case "funnel":
      return <Funnel {...chartProps} />;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticChart;
