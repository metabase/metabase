import _ from "underscore";

import type {
  Dataset,
  DatasetColumn,
  DatasetData,
  RowValues,
} from "metabase-types/api";
import type {
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

import { extractReferencedColumns } from "./column";
import { getDataSourceIdFromNameRef, isDataSourceNameRef } from "./data-source";

type MergeVisualizerSeries = {
  columns: DatasetColumn[];
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>;
  datasets: Record<VisualizerDataSourceId, Dataset | null | undefined>;
  dataSources: VisualizerDataSource[];
};

export function mergeVisualizerData({
  columns,
  columnValuesMapping,
  datasets,
  dataSources,
}: MergeVisualizerSeries): DatasetData {
  const referencedColumns = extractReferencedColumns(columnValuesMapping);

  const referencedColumnValuesMap: Record<string, RowValues> = {};
  referencedColumns.forEach(ref => {
    const dataset = datasets[ref.sourceId];
    if (!dataset) {
      return;
    }
    const columnIndex = dataset.data.cols.findIndex(
      col => col.name === ref.originalName,
    );
    if (columnIndex >= 0) {
      const values = dataset.data.rows.map(row => row[columnIndex]);
      referencedColumnValuesMap[ref.name] = values;
    }
  });

  const hasPivotGrouping = columns.some(col => col.name === "pivot-grouping");
  if (hasPivotGrouping) {
    const rowLengths = Object.values(referencedColumnValuesMap).map(
      values => values.length,
    );
    const maxLength = rowLengths.length > 0 ? Math.max(...rowLengths) : 0;
    referencedColumnValuesMap["pivot-grouping"] = new Array(maxLength).fill(0);
  }

  const unzippedRows = columns.map(column =>
    (columnValuesMapping[column.name] ?? [])
      .map(valueSource => {
        if (isDataSourceNameRef(valueSource)) {
          const id = getDataSourceIdFromNameRef(valueSource);
          const dataSource = dataSources.find(source => source.id === id);
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
