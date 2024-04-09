import type { DatasetColumn, DatasetData } from "metabase-types/api";

export type RemappingHydratedDatasetColumn = DatasetColumn & {
  remapped_from_index?: number;
  remapped_to_column?: DatasetColumn;
  remapping?: Map<any, any>;
};

export type RemappingHydratedChartData = DatasetData & {
  cols: RemappingHydratedDatasetColumn[];
};
