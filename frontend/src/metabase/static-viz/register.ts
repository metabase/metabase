import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";
import { AREA_CHART_DEFINITION } from "metabase/visualizations/visualizations/AreaChart/definition";
import { BAR_CHART_DEFINITION } from "metabase/visualizations/visualizations/BarChart/definition";
import { BOXPLOT_CHART_DEFINITION } from "metabase/visualizations/visualizations/BoxPlot/definition";
import { COMBO_CHART_DEFINITION } from "metabase/visualizations/visualizations/ComboChart/definition";
import { FUNNEL_CHART_DEFINITION } from "metabase/visualizations/visualizations/Funnel/definition";
import { LINE_CHART_DEFINITION } from "metabase/visualizations/visualizations/LineChart/definition";
import { PIE_CHART_DEFINITION } from "metabase/visualizations/visualizations/PieChart/definition";
import { PROGRESS_CHART_DEFINITION } from "metabase/visualizations/visualizations/Progress/definition";
import { ROW_CHART_DEFINITION } from "metabase/visualizations/visualizations/RowChart/definition";
import { SANKEY_CHART_DEFINITION } from "metabase/visualizations/visualizations/SankeyChart/definition";
import { SCALAR_CHART_DEFINITION } from "metabase/visualizations/visualizations/Scalar/definition";
import { SCATTER_PLOT_DEFINITION } from "metabase/visualizations/visualizations/ScatterPlot/definition";
import { SMART_SCALAR_CHART_DEFINITION } from "metabase/visualizations/visualizations/SmartScalar/definition";
import { TREEMAP_CHART_DEFINITION } from "metabase/visualizations/visualizations/TreemapChart/definition";
import { WATERFALL_CHART_DEFINITION } from "metabase/visualizations/visualizations/WaterfallChart/definition";

const STATIC_CHART_DEFINITIONS = [
  SCALAR_CHART_DEFINITION,
  SMART_SCALAR_CHART_DEFINITION,
  LINE_CHART_DEFINITION,
  AREA_CHART_DEFINITION,
  FUNNEL_CHART_DEFINITION,
  BAR_CHART_DEFINITION,
  WATERFALL_CHART_DEFINITION,
  COMBO_CHART_DEFINITION,
  SCATTER_PLOT_DEFINITION,
  BOXPLOT_CHART_DEFINITION,
  PIE_CHART_DEFINITION,
  SANKEY_CHART_DEFINITION,
  ROW_CHART_DEFINITION,
  PROGRESS_CHART_DEFINITION,
  TREEMAP_CHART_DEFINITION,
];

export const registerStaticVisualizations = () => {
  STATIC_CHART_DEFINITIONS.forEach((definition) => {
    registerVisualization(definition);
  });
  setDefaultVisualization(SCALAR_CHART_DEFINITION);
};
