import _ from "underscore";

import { isCartesianChart } from "metabase/visualizations";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  Dataset,
  DatasetColumn,
  Field,
  VisualizerDataSourceId,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { findColumnSlotForCartesianChart } from "./cartesian";
import { findColumnSlotForFunnel } from "./funnel";
import { findColumnSlotForPieChart } from "./pie";

type CompatFn = (parameters: {
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >;
  settings: ComputedVisualizationSettings;
  datasets: Record<VisualizerDataSourceId, Dataset>;
  dataSourceColumns: DatasetColumn[];
  column: DatasetColumn;
}) => string | undefined;

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
  settings: ComputedVisualizationSettings,
  datasets: Record<string, Dataset>,
  dataSourceColumns: DatasetColumn[],
  column: DatasetColumn,
) {
  const { display } = state;
  if (!display) {
    return "*";
  }

  const compatFn =
    vizMappingFn[isCartesianChart(display) ? "cartesian" : display];

  if (compatFn) {
    return compatFn({ state, settings, datasets, dataSourceColumns, column });
  } else {
    return undefined;
  }
}

export function groupColumnsBySuitableVizSettings(
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  settings: ComputedVisualizationSettings,
  datasets: Record<string, Dataset>,
  columns: DatasetColumn[] | Field[],
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
        slot: compatFn({
          state,
          settings,
          datasets,
          dataSourceColumns: columns as DatasetColumn[],
          column: column as DatasetColumn,
        }),
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
