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
  BarChart,
  getCartesianChartDefinition({
    uiName: t`Bar`,
    identifier: "bar",
    iconName: "bar",
    noun: t`bar chart`,
    minSize: getMinSize("bar"),
    defaultSize: getDefaultSize("bar"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    },
  }),
);

export function BarChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
