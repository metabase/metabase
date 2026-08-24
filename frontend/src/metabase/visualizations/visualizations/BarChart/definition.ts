import { t } from "ttag";

import {
  COMBO_CHARTS_SETTINGS_DEFINITIONS,
  getCartesianChartDefinition,
} from "metabase/visualizations/visualizations/CartesianChart/definition";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/viz-core/types";

const BarViz: Omit<VisualizationDefinition, "isSensible" | "checkRenderable"> =
  {
    getUiName: () => t`Bar`,
    identifier: "bar",
    iconName: "bar",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    noun: t`bar chart`,
    minSize: getMinSize("bar"),
    defaultSize: getDefaultSize("bar"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    },
  };

export const BAR_CHART_DEFINITION = getCartesianChartDefinition(BarViz);
