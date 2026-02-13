import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";
import type { Visualization } from "metabase/visualizations/types/visualization";
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

// These visualizations have static properties (like `identifier`, `getUiName`, etc.)
// that satisfy VisualizationDefinition at runtime but aren't captured in their component types.
const reg = registerVisualization as (viz: unknown) => void;
const setDefault = setDefaultVisualization as (viz: unknown) => void;

export const registerStaticVisualizations = () => {
  reg(Scalar);
  reg(SmartScalar);
  reg(LineChart);
  reg(AreaChart);
  reg(Funnel);
  reg(BarChart);
  reg(WaterfallChart);
  reg(ComboChart);
  reg(ScatterPlot);
  reg(PieChart);
  reg(SankeyChart);
  reg(RowChart);
  reg(Progress);
  setDefault(Scalar);
};
