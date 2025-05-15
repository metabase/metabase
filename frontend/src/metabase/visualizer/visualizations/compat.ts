import _ from "underscore";

import { isCartesianChart } from "metabase/visualizations";
import type {
  Dataset,
  DatasetColumn,
  Field,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { findColumnSlotForCartesianChart } from "./cartesian";
import { findColumnSlotForFunnel } from "./funnel";
import { findColumnSlotForPieChart } from "./pie";

type CompatFn = (
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  datasets: Record<VisualizerDataSourceId, Dataset>,
  column: DatasetColumn,
  dataSource: VisualizerDataSource,
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
  datasets: Record<string, Dataset>,
  column: DatasetColumn,
  dataSource: VisualizerDataSource,
) {
  const { display } = state;
  if (!display) {
    return "*";
  }

  const compatFn =
    vizMappingFn[isCartesianChart(display) ? "cartesian" : display];

  if (compatFn) {
    return compatFn(state, datasets, column, dataSource);
  } else {
    return undefined;
  }
}

export function groupColumnsBySuitableVizSettings(
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  datasets: Record<string, Dataset>,
  columns: DatasetColumn[] | Field[],
  dataSource: VisualizerDataSource,
) {
  const { display } = state;
  if (!display) {
    return { "*": columns };
  }

  const compatFn =
    vizMappingFn[isCartesianChart(display) ? "cartesian" : display];

  if (compatFn) {
    const mapping = columns
      .map((column) => ({
        column,
        // TODO Fix type casting
        slot: compatFn(state, datasets, column as DatasetColumn, dataSource),
      }))
      .filter((mapping) => !!mapping.slot);
    const groupedMappings = _.groupBy(mapping, (m) => m.slot as string);
    return _.mapObject(groupedMappings, (mappings) =>
      mappings.map((m) => m.column),
    );
  } else {
    return {};
  }
}
