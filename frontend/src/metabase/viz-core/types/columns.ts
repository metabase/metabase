import type * as Lib from "metabase-lib";
import type { DatasetColumn, DatasetData, RowValues } from "metabase-types/api";

export type RemappingHydratedDatasetColumn = DatasetColumn & {
  remapped_from_index?: number;
  remapped_to_column?: DatasetColumn;
  remapping?: Map<any, any>;
};

export type RemappingHydratedChartData = DatasetData & {
  cols: RemappingHydratedDatasetColumn[];
};

export type PivotedRowValues = RowValues & {
  _dimension?: Lib.ClickObjectDimension; // present in pivoted data
};

export type PivotedDatasetColumn = DatasetColumn & {
  _dimension?: Lib.ClickObjectDimension; // present in pivoted data
};
