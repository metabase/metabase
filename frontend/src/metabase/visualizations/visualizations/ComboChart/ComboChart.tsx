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

function ComboChartComponent(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}

export const ComboChart = Object.assign(
  ComboChartComponent,
  getCartesianChartDefinition(ComboViz),
);
