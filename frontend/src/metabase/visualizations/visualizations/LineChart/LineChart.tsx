import { t } from "ttag";

import {
  type NormalizableVisualizationProps,
  useNormalizedVisualizationProps,
} from "metabase/visualizations/hooks/use-normalized-visualization-props";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import {
  COMBO_CHARTS_SETTINGS_DEFINITIONS,
  getCartesianChartDefinition,
} from "metabase/visualizations/visualizations/CartesianChart/chart-definition";

import type { VisualizationDefinition } from "../../types";

const LINE_CHART_DEFINITION = getCartesianChartDefinition({
  getUiName: () => t`Line`,
  identifier: "line",
  iconName: "line",
  // eslint-disable-next-line ttag/no-module-declaration
  noun: t`line chart`,
  minSize: getMinSize("line"),
  defaultSize: getDefaultSize("line"),
  settings: COMBO_CHARTS_SETTINGS_DEFINITIONS,
}) as VisualizationDefinition;

function LineChartComponent(props: NormalizableVisualizationProps) {
  const normalizedProps = useNormalizedVisualizationProps(props);

  return <CartesianChart {...normalizedProps} />;
}

export const LineChart = Object.assign(
  LineChartComponent,
  LINE_CHART_DEFINITION,
);
