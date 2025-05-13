import { isCartesianChart } from "metabase/visualizations";
import type { DatasetColumn } from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { findColumnSlotForCartesianChart } from "./cartesian";
import { findColumnSlotForFunnel } from "./funnel";
import { findColumnSlotForPieChart } from "./pie";

type CompatFn = (
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  column: DatasetColumn,
) => string | undefined;

const vizMappingFn: Record<string, CompatFn> = {
  cartesian: findColumnSlotForCartesianChart,
  pie: findColumnSlotForPieChart,
  funnel: findColumnSlotForFunnel,
};

export function findSlotForColumn(
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  column: DatasetColumn,
) {
  const { display } = state;
  if (!display) {
    return "*";
  }

  const compatFn =
    vizMappingFn[isCartesianChart(display) ? "cartesian" : display];

  if (compatFn) {
    return compatFn(state, column);
  } else {
    return undefined;
  }
}
