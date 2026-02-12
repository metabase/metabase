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
  LineChart,
  getCartesianChartDefinition({
    getUiName: () => t`Line`,
    identifier: "line",
    iconName: "line",
    // eslint-disable-next-line ttag/no-module-declaration
    noun: t`line chart`,
    minSize: getMinSize("line"),
    defaultSize: getDefaultSize("line"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function LineChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
