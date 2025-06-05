import _ from "underscore";

import type {
  Dataset,
  DatasetColumn,
  RowValues,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";

import { extractReferencedColumns } from "./column";
import { getDataSourceIdFromNameRef, isDataSourceNameRef } from "./data-source";

type MergeVisualizerSeries = {
  /**
   * The columns to merge
   */
  columns: DatasetColumn[];
  /**
   * The mapping of column values to their sources
   */
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;
  /**
   * The datasets to merge
   */
  datasets: Record<VisualizerDataSourceId, Dataset | null | undefined>;
  /**
   * The data sources to merge
   */
  dataSources: VisualizerDataSource[];
};

/**
 * Merges data from multiple datasets into a single dataset.
 *
 * @param param0 - The data to merge
 * @returns the merged data or undefined if the data is loading
 */
export function mergeVisualizerData({
  columns,
  columnValuesMapping,
  datasets,
  dataSources,
}: MergeVisualizerSeries) {
  const referencedColumns = extractReferencedColumns(columnValuesMapping);

  const referencedColumnValuesMap: Record<string, RowValues> = {};
  referencedColumns.forEach((ref) => {
    const dataset = datasets[ref.sourceId];
    if (!dataset) {
      return;
    }
    const columnIndex = dataset.data.cols.findIndex(
      (col) => col.name === ref.originalName,
    );
    if (columnIndex >= 0) {
      const values = dataset.data.rows.map((row) => row[columnIndex]);
      referencedColumnValuesMap[ref.name] = values;
    }
  });

  const unzippedRows = columns.map((column) =>
    (columnValuesMapping[column.name] ?? [])
      .map((valueSource) => {
        if (isDataSourceNameRef(valueSource)) {
          const id = getDataSourceIdFromNameRef(valueSource);
          const dataSource = dataSources.find((source) => source.id === id);
          return dataSource?.name ? [dataSource.name] : [];
        }
        const values = referencedColumnValuesMap[valueSource.name];
        if (!values) {
          return [];
        }
        return values;
      })
      .flat(),
  );

  return {
    cols: columns,
    rows: _.zip(...unzippedRows),
    results_metadata: { columns },
  };
}
