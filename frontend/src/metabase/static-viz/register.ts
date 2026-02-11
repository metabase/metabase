import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";
import { AreaChart } from "metabase/visualizations/visualizations/AreaChart";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
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
  registerVisualization(Scalar);
  registerVisualization(SmartScalar);
  registerVisualization(LineChart);
  registerVisualization(AreaChart);
  registerVisualization(Funnel);
  registerVisualization(BarChart);
  registerVisualization(WaterfallChart);
  registerVisualization(ComboChart);
  registerVisualization(ScatterPlot);
  registerVisualization(PieChart);
  registerVisualization(SankeyChart);
  registerVisualization(RowChart);
  registerVisualization(Progress);
  setDefaultVisualization(Scalar);
};
