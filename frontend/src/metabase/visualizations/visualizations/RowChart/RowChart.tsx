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
  RowChart,
  getCartesianChartDefinition({
    getUiName: () => t`Row`,
    identifier: "row",
    iconName: "horizontal_bar",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    noun: t`row chart`,
    minSize: getMinSize("row"),
    defaultSize: getDefaultSize("row"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function RowChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}