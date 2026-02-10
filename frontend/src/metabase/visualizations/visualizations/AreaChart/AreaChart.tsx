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
import {
  hasLatitudeAndLongitudeColumns,
  isDimension,
  isMetric,
} from "metabase-lib/v1/types/utils/isa";

import type {
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";

Object.assign(
  AreaChart,
  getCartesianChartDefinition({
    getUiName: () => t`Area`,
    identifier: "area",
    iconName: "area",
    getSensibility: (data) => {
      const { cols, rows } = data;
      const dimensionCount = cols.filter(isDimension).length;
      const metricCount = cols.filter(isMetric).length;
      const hasAggregation = cols.some(
        (col) => col.source === "aggregation" || col.source === "native",
      );
      const hasLatLong = hasLatitudeAndLongitudeColumns(cols);

      if (
        rows.length <= 1 ||
        cols.length < 2 ||
        dimensionCount < 1 ||
        metricCount < 1
      ) {
        return "nonsensible";
      }
      if (!hasAggregation || hasLatLong) {
        return "sensible";
      }
      return "recommended";
    },
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    noun: t`area chart`,
    minSize: getMinSize("area"),
    defaultSize: getDefaultSize("area"),
    settings: {
      ...COMBO_CHARTS_SETTINGS_DEFINITIONS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function AreaChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
