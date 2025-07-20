import _ from "underscore";

import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { isCartesianChart } from "metabase/visualizations";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isDate, isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
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

type CompatFn = (
  state: Pick<
    VisualizerVizDefinitionWithColumns,
    "display" | "columns" | "settings"
  >,
  settings: ComputedVisualizationSettings,
  datasets: Record<VisualizerDataSourceId, Dataset>,
  dataSourceColumns: DatasetColumn[],
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
    return compatFn(state, settings, datasets, dataSourceColumns, column);
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
  const { display, columns: ownColumns } = state;
  if (!display) {
    return { "*": columns };
  }

  if (isCartesianChart(display)) {
    const hasCompatibleDimensions =
      checkDimensionCompatibilityForCartesianCharts(ownColumns, columns);
    if (!hasCompatibleDimensions) {
      return {};
    }
  }

  const compatFn =
    vizMappingFn[isCartesianChart(display) ? "cartesian" : display];

  if (compatFn) {
    const mapping = columns
      .map((column) => ({
        column,
        // TODO Fix type casting
        slot: compatFn(
          state,
          settings,
          datasets,
          columns as DatasetColumn[],
          column as DatasetColumn,
        ),
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

export function partitionTimeDimensions<T extends DatasetColumn[] | Field[]>(
  columns: T,
): {
  dimensions: T;
  timeDimensions: T;
  otherDimensions: T;
} {
  // Extract only dimension columns (exclude metrics and pivot group columns)
  const dimensions = columns.filter(
    (col) => isDimension(col) && !isMetric(col) && !isPivotGroupColumn(col),
  ) as T;

  // Partition temporal & non-temporal dimensions
  const [timeDimensions, otherDimensions] = _.partition(dimensions, (col) =>
    isDate(col),
  ) as unknown as [T, T];

  return { dimensions, timeDimensions, otherDimensions };
}

function checkDimensionCompatibilityForCartesianCharts(
  ownColumns: DatasetColumn[],
  targetColumns: DatasetColumn[] | Field[],
) {
  const {
    dimensions: ownDimensions,
    timeDimensions: ownTimeDimensions,
    otherDimensions: ownOtherDimensions,
  } = partitionTimeDimensions(ownColumns);

  // Cartesian charts require at least one dimension in the current visualization
  if (ownDimensions.length === 0) {
    return false;
  }

  // If current viz has time dimensions, target dataset must have at least one date field
  if (ownTimeDimensions.length > 0) {
    const isCompatible = targetColumns.some((field) => isDate(field));
    if (!isCompatible) {
      return false;
    }
  }

  // If current viz has non-time dimensions, target dataset must contain all of them (by ID)
  if (ownOtherDimensions.length > 0) {
    const isCompatible = ownOtherDimensions.every((dimension) =>
      targetColumns.some((field) => dimension.id && field.id === dimension.id),
    );
    if (!isCompatible) {
      return false;
    }
  }

  const {
    timeDimensions: targetTimeDimensions,
    otherDimensions: targetOtherDimensions,
  } = partitionTimeDimensions(targetColumns);

  // If target dataset has time dimensions, current viz must have at least one date field
  if (targetTimeDimensions.length > 0) {
    const isCompatible = ownColumns.some((field) => isDate(field));
    if (!isCompatible) {
      return false;
    }
  }

  // If target dataset has non-time dimensions, current viz must contain all of them (by ID)
  if (targetOtherDimensions.length > 0) {
    const isCompatible = targetOtherDimensions.every((dimension) =>
      ownColumns.some((field) => dimension.id && field.id === dimension.id),
    );
    if (!isCompatible) {
      return false;
    }
  }

  return true;
}
