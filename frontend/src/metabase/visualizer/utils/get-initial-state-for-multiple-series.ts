import { isNotNull } from "metabase/lib/types";
import type {
  Card,
  Dataset,
  DatasetColumn,
  RawSeries,
  VisualizerColumnReference,
  VisualizerDataSource,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumnsAndFallbacks } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import { createDataSource } from "./data-source";
import { updateVizSettingsWithRefs } from "./update-viz-settings-with-refs";
import { getColumnVizSettings } from "./viz-settings";

type ColumnInfo = {
  columnRef: VisualizerColumnReference;
  column: DatasetColumn;
};

function mapColumnVizSettings(
  card: Card,
  columnInfos: ColumnInfo[],
): Record<string, string | string[]> {
  const entries = getColumnVizSettings(card.display)
    .map((setting) => {
      const originalValue = card.visualization_settings[setting];
      if (!originalValue) {
        return null;
      }

      if (Array.isArray(originalValue)) {
        const mappedColumns = originalValue
          .map((originalColumnName) => {
            const columnInfo = columnInfos.find(
              (info) => info.columnRef.originalName === originalColumnName,
            );
            return columnInfo?.columnRef.name;
          })
          .filter(isNotNull);

        return mappedColumns.length > 0 ? [setting, mappedColumns] : null;
      } else {
        const columnInfo = columnInfos.find(
          (info) => info.columnRef.originalName === originalValue,
        );
        return columnInfo?.columnRef.name
          ? [setting, columnInfo.columnRef.name]
          : null;
      }
    })
    .filter(isNotNull);

  return Object.fromEntries(entries);
}

function processColumnsForDataSource(
  dataSource: VisualizerDataSource,
  columns: DatasetColumn[],
  state: VisualizerVizDefinitionWithColumnsAndFallbacks,
): ColumnInfo[] {
  const columnInfos: ColumnInfo[] = [];

  columns.forEach((column) => {
    const columnRef = createVisualizerColumnReference(
      dataSource,
      column,
      extractReferencedColumns(state.columnValuesMapping),
    );

    const processedColumn = copyColumn(
      columnRef.name,
      column,
      dataSource.name,
      state.columns,
    );

    state.columns.push(processedColumn);
    state.columnValuesMapping[columnRef.name] = [columnRef];

    columnInfos.push({
      columnRef,
      column: processedColumn,
    });
  });

  return columnInfos;
}

export function getInitialStateForMultipleSeries(rawSeries: RawSeries) {
  const mainCard = rawSeries[0].card;

  const state: VisualizerVizDefinitionWithColumnsAndFallbacks = {
    display: mainCard.display,
    columns: [],
    columnValuesMapping: {},
    settings: {},
    datasetFallbacks: rawSeries.reduce(
      (acc, s) => {
        acc[s.card.id] = s as unknown as Dataset;
        return acc;
      },
      {} as Record<number, Dataset | null | undefined>,
    ),
  };

  const dataSources = rawSeries.map(({ card }) =>
    createDataSource("card", card.id, card.name),
  );

  const allColumnInfos: ColumnInfo[][] = rawSeries.map(
    (series, seriesIndex) => {
      return processColumnsForDataSource(
        dataSources[seriesIndex],
        series.data.cols,
        state,
      );
    },
  );

  const columnsToRefs: Record<string, string> = {};
  allColumnInfos.flat().forEach(({ columnRef }) => {
    columnsToRefs[columnRef.originalName] = columnRef.name;
  });

  // Hack because settings use the original column display names for
  // cards series except the first one ಠ_ಠ
  rawSeries.forEach((series) => {
    const metricName =
      series.card.visualization_settings?.["graph.metrics"]?.[0];
    if (metricName) {
      const displayName = series.data.cols.find(
        (c) => c.name === metricName,
      )?.display_name;
      if (displayName) {
        columnsToRefs[series.card.name] = displayName;
      }
    }
  });

  const settingsFromAllCards = rawSeries.map((series, seriesIndex) => {
    return mapColumnVizSettings(series.card, allColumnInfos[seriesIndex]);
  });

  const mergedSettings = settingsFromAllCards.reduce<
    Record<string, string | string[]>
  >((acc, settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      const mergedValue = acc[key];
      if (mergedValue == null) {
        acc[key] = value;
      } else if (Array.isArray(mergedValue) && Array.isArray(value)) {
        mergedValue.push(...value);
      }
    });
    return acc;
  }, {});

  state.settings = {
    ...updateVizSettingsWithRefs(
      mainCard.visualization_settings,
      columnsToRefs,
    ),
    ...mergedSettings,
  };

  return state;
}
