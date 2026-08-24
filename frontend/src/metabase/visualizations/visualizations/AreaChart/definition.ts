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

const AreaViz: Omit<VisualizationDefinition, "isSensible" | "checkRenderable"> =
  {
    getUiName: () => t`Area`,
    identifier: "area",
    iconName: "area",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    noun: t`area chart`,
    minSize: getMinSize("area"),
    defaultSize: getDefaultSize("area"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    },
  };

export const AREA_CHART_DEFINITION = getCartesianChartDefinition(AreaViz);
