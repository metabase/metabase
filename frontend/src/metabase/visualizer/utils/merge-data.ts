import _ from "underscore";

import type {
  Dataset,
  DatasetColumn,
  Field,
  RowValues,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";

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
  const insights: Insight[] = [];
  referencedColumns.forEach((ref) => {
    const dataset = datasets[ref.sourceId];
    // Errored datasets (e.g. permission denied) may not carry `data`.
    if (!dataset || dataset.error != null) {
      return;
    }
    const columnIndex = dataset.data.cols.findIndex(
      (col) => col.name === ref.originalName,
    );
    if (columnIndex >= 0) {
      const values = dataset.data.rows.map((row) => row[columnIndex]);
      referencedColumnValuesMap[ref.name] = values;
    }
    const insight = dataset.data.insights?.find(
      (insight) => insight.col === ref.originalName,
    );
    if (insight) {
      insights.push({
        ...insight,
        col: ref.name,
      });
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

  // Carry the timezone from the source dataset(s) so time-series charts format datetimes in the query's
  // report timezone. Without it the cartesian axis falls back to UTC (#73972).
  const sourceData = referencedColumns
    .map((ref) => datasets[ref.sourceId])
    .find(
      (dataset) =>
        dataset?.error == null && dataset?.data?.results_timezone != null,
    )?.data;

  return {
    cols: columns,
    rows: _.zip(...unzippedRows),
    insights,
    results_timezone: sourceData?.results_timezone,
    requested_timezone: sourceData?.requested_timezone,
    // this is incorrect - `data.cols` are not the same as `data.results_metadata.columns`
    results_metadata: { columns: columns as unknown as Field[] },
  };
}
