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

const AREA_CHART_DEFINITION = getCartesianChartDefinition({
  getUiName: () => t`Area`,
  identifier: "area",
  iconName: "area",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`area chart`,
  minSize: getMinSize("area"),
  defaultSize: getDefaultSize("area"),
  settings: COMBO_CHARTS_SETTINGS_DEFINITIONS,
}) as VisualizationDefinition;

function AreaChartComponent(props: NormalizableVisualizationProps) {
  const normalizedProps = useNormalizedVisualizationProps(props);

  return <CartesianChart {...normalizedProps} />;
}

export const AreaChart = Object.assign(
  AreaChartComponent,
  AREA_CHART_DEFINITION,
);
