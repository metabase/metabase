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

const COMBO_CHART_DEFINITION = getCartesianChartDefinition({
  getUiName: () => t`Combo`,
  identifier: "combo",
  iconName: "lineandbar",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`line and bar chart`,
  minSize: getMinSize("combo"),
  defaultSize: getDefaultSize("combo"),
  settings: COMBO_CHARTS_SETTINGS_DEFINITIONS,
}) as VisualizationDefinition;

function ComboChartComponent(props: NormalizableVisualizationProps) {
  const normalizedProps = useNormalizedVisualizationProps(props);

  return <CartesianChart {...normalizedProps} />;
}

export const ComboChart = Object.assign(
  ComboChartComponent,
  COMBO_CHART_DEFINITION,
);
