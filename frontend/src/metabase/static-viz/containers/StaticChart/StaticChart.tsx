import { createColorGetter } from "metabase/static-viz/lib/colors";
import RowChart from "metabase/static-viz/components/RowChart";
import { ROW_CHART_TYPE } from "metabase/static-viz/components/RowChart/constants";
import Gauge from "metabase/static-viz/components/Gauge";
import { GAUGE_CHART_TYPE } from "metabase/static-viz/components/Gauge/constants";
import CategoricalDonutChart from "metabase/static-viz/components/CategoricalDonutChart";
import { CATEGORICAL_DONUT_CHART_TYPE } from "metabase/static-viz/components/CategoricalDonutChart/constants";
import WaterfallChart from "metabase/static-viz/components/WaterfallChart";
import { WATERFALL_CHART_TYPE } from "metabase/static-viz/components/WaterfallChart/constants";
import ProgressBar from "metabase/static-viz/components/ProgressBar";
import { PROGRESS_BAR_TYPE } from "metabase/static-viz/components/ProgressBar/constants";
import LineAreaBarChart from "metabase/static-viz/components/LineAreaBarChart";
import { LINE_AREA_BAR_CHART_TYPE } from "metabase/static-viz/components/LineAreaBarChart/constants";
import Funnel from "metabase/static-viz/components/FunnelChart";
import { FUNNEL_CHART_TYPE } from "metabase/static-viz/components/FunnelChart/constants";
import { PieChart } from "metabase/static-viz/components/PieChart";
import { PIE_CHART_TYPE } from "metabase/static-viz/components/PieChart/constants";

import { formatStaticValue } from "metabase/static-viz/lib/format";
import type { StaticChartProps } from "./types";

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
    case ROW_CHART_TYPE:
      return <RowChart {...chartProps} />;
    case PROGRESS_BAR_TYPE:
      return <ProgressBar {...chartProps} />;
    case LINE_AREA_BAR_CHART_TYPE:
      return <LineAreaBarChart {...chartProps} />;
    case FUNNEL_CHART_TYPE:
      return <Funnel {...chartProps} />;
    case PIE_CHART_TYPE:
      return (
        <PieChart
          rawSeries={[{ card: chartProps.card, data: chartProps.data }]}
          environment={{ getColor, formatValue: formatStaticValue }}
        />
      );
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticChart;
