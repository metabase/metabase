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

const ComboViz: Omit<
  VisualizationDefinition,
  "isSensible" | "checkRenderable"
> = {
  getUiName: () => t`Combo`,
  identifier: "combo",
  iconName: "lineandbar",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`line and bar chart`,
  minSize: getMinSize("combo"),
  defaultSize: getDefaultSize("combo"),
  settings: {
    ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
  },
};

export const COMBO_CHART_DEFINITION = getCartesianChartDefinition(ComboViz);
