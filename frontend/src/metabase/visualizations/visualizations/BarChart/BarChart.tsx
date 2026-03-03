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

const BAR_CHART_DEFINITION = getCartesianChartDefinition({
  getUiName: () => t`Bar`,
  identifier: "bar",
  iconName: "bar",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`bar chart`,
  minSize: getMinSize("bar"),
  defaultSize: getDefaultSize("bar"),
  settings: COMBO_CHARTS_SETTINGS_DEFINITIONS,
}) as VisualizationDefinition;

function BarChartComponent(props: NormalizableVisualizationProps) {
  const normalizedProps = useNormalizedVisualizationProps(props);

  return <CartesianChart {...normalizedProps} />;
}

export const BarChart = Object.assign(BarChartComponent, BAR_CHART_DEFINITION);
