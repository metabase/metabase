import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import { isCartesianChart } from "metabase/visualizations";
import type {
  RawSeries,
  VisualizerColumnValueSource,
} from "metabase-types/api";

import { isDataSourceNameRef } from "./data-source";

export function shouldSplitVisualizerSeries(
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
) {
  const mappings = Object.values(columnValuesMapping).flat();
  const uniqueDataSources = _.uniq(
    mappings
      .map((mapping) =>
        !isDataSourceNameRef(mapping) ? mapping.sourceId : null,
      )
      .filter(isNotNull),
  );
  return uniqueDataSources.length > 1;
}

export function splitVisualizerSeries(
  series: RawSeries,
  columnValuesMapping: Record<string, VisualizerColumnValueSource[]>,
  dataSourceNameMap: Record<string, string>,
): RawSeries {
  if (!series || series.length === 0 || series.some((s) => !s.data)) {
    return series;
  }

  const [{ card: mainCard, data }] = series;
  if (!isCartesianChart(mainCard.display)) {
    return series;
  }

  const dataSourceIds = _.uniq(
    Object.values(columnValuesMapping)
      .map((valueSources) => {
        const [valueSource] = valueSources;
        if (!isDataSourceNameRef(valueSource)) {
          return valueSource.sourceId;
        }
      })
      .filter(isNotNull),
  );

  const allMetrics = mainCard.visualization_settings["graph.metrics"];
  const allDimensions = mainCard.visualization_settings["graph.dimensions"];

  return dataSourceIds
    .map((dataSourceId, i) => {
      const columnNames = Object.keys(columnValuesMapping).filter(
        (columnName) =>
          columnValuesMapping[columnName].some(
            (valueSource) =>
              !isDataSourceNameRef(valueSource) &&
              valueSource.sourceId === dataSourceId,
          ),
      );

      const cols = series[0].data.cols.filter((col) =>
        columnNames.includes(col.name),
      );
      const resultMetadataCols = series[0].data.results_metadata.columns.filter(
        (col) => columnNames.includes(col.name),
      );

      if (cols.length === 0) {
        return null;
      }

      const rows = series[0].data.rows
        .map((row) =>
          row.filter((_, i) => columnNames.includes(data.cols[i].name)),
        )
        // if the entire row is undefined, it was introduced when joining in mergeVisualizerData
        .filter((row) => row.some((val) => val !== undefined));

      const metrics = allMetrics?.filter((columnName) =>
        columnNames.includes(columnName),
      );
      const [mainMetric] = metrics ?? [];

      const seriesName =
        dataSourceNameMap[dataSourceId] ??
        cols.find((col) => col.name === mainMetric)?.display_name ??
        `Series ${i + 1}`;

      return {
        card: {
          ...mainCard,
          id: getVisualizerSeriesCardId(i),
          name: seriesName,
          visualization_settings: {
            ...mainCard.visualization_settings,
            "graph.metrics": metrics,
            "graph.dimensions": allDimensions?.filter((columnName) =>
              columnNames.includes(columnName),
            ),
          },
        },
        data: {
          cols,
          rows,
          insights: series[0].data.insights?.filter((insight) =>
            columnNames.includes(insight.col),
          ),
          results_metadata: { columns: resultMetadataCols },
        },
        columnValuesMapping,
        started_at: new Date().toISOString(),
      };
    })
    .filter(isNotNull) as RawSeries;
}

function getVisualizerSeriesCardId(seriesIndex: number) {
  return -(seriesIndex + 1);
}

export function getVisualizerSeriesCardIndex(cardId?: number) {
  if (!cardId) {
    return 0;
  }
  return -cardId - 1;
}
