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

import type { VisualizationProps } from "../../types";

Object.assign(
  AreaChart,
  getCartesianChartDefinition({
    uiName: t`Area`,
    identifier: "area",
    iconName: "area",
    noun: t`area chart`,
    minSize: getMinSize("area"),
    defaultSize: getDefaultSize("area"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    },
  }),
);

export function AreaChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
