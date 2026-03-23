import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import {
  COMBO_CHARTS_SETTINGS_DEFINITIONS,
  getCartesianChartDefinition,
} from "metabase/visualizations/visualizations/CartesianChart/chart-definition";

import type { VisualizationDefinition, VisualizationProps } from "../../types";

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

Object.assign(AreaChart, getCartesianChartDefinition(AreaViz));

export function AreaChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
