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
  ComboChart,
  getCartesianChartDefinition({
    uiName: t`Combo`,
    identifier: "combo",
    iconName: "lineandbar",
    noun: t`line and bar chart`,
    minSize: getMinSize("combo"),
    defaultSize: getDefaultSize("combo"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    },
  }),
);

export function ComboChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
