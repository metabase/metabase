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

import type {
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";

Object.assign(
  ComboChart,
  getCartesianChartDefinition({
    get uiName() {
      return t`Combo`;
    },
    identifier: "combo",
    iconName: "lineandbar",
    get noun() {
      return t`line and bar chart`;
    },
    minSize: getMinSize("combo"),
    defaultSize: getDefaultSize("combo"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function ComboChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
