import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";
import { AreaChart } from "metabase/visualizations/visualizations/AreaChart";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { BoxPlot } from "metabase/visualizations/visualizations/BoxPlot";
import { ComboChart } from "metabase/visualizations/visualizations/ComboChart";
import { Funnel } from "metabase/visualizations/visualizations/Funnel";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import { PieChart } from "metabase/visualizations/visualizations/PieChart";
import { Progress } from "metabase/visualizations/visualizations/Progress";
import { RowChart } from "metabase/visualizations/visualizations/RowChart";
import { SankeyChart } from "metabase/visualizations/visualizations/SankeyChart";
import { Scalar } from "metabase/visualizations/visualizations/Scalar";
import { ScatterPlot } from "metabase/visualizations/visualizations/ScatterPlot";
import { SmartScalar } from "metabase/visualizations/visualizations/SmartScalar";
import { WaterfallChart } from "metabase/visualizations/visualizations/WaterfallChart";

export const registerStaticVisualizations = () => {
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Scalar);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(SmartScalar);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(LineChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(AreaChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Funnel);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(BarChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(WaterfallChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ComboChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(ScatterPlot);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(BoxPlot);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(PieChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(SankeyChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(RowChart);
  // @ts-expect-error: incompatible prop types with registerVisualization
  registerVisualization(Progress);
  // @ts-expect-error: incompatible prop types with registerVisualization
  setDefaultVisualization(Scalar);
};
