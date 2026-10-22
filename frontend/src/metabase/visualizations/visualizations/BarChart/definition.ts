import { t } from "ttag";

import {
  COMBO_CHARTS_SETTINGS_DEFINITIONS,
  getCartesianChartDefinition,
} from "metabase/visualizations/visualizations/CartesianChart/definition";
import {
  type VisualizationDefinition,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";

const BarViz: Omit<VisualizationDefinition, "isSensible" | "checkRenderable"> =
  {
    getUiName: () => t`Bar`,
    identifier: "bar",
    iconName: "bar",
    get noun() {
      return t`bar chart`;
    },
    minSize: getMinSize("bar"),
    defaultSize: getDefaultSize("bar"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
      // Set by the product analytics funnel; has no widget
      "product_analytics.funnel_steps": {
        getDefault: () => false,
      },
      "product_analytics.funnel_step_colors": {
        getDefault: () => [],
      },
    },
  };

export const BAR_CHART_DEFINITION = getCartesianChartDefinition(BarViz);
