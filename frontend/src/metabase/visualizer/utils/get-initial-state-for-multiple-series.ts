import { isNotNull } from "metabase/lib/types";
import type {
  Card,
  DatasetColumn,
  RawSeries,
  VisualizerColumnReference,
  VisualizerDataSource,
} from "metabase-types/api";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createVisualizerColumnReference,
  extractReferencedColumns,
} from "./column";
import { createDataSource } from "./data-source";
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
  state: VisualizerVizDefinitionWithColumns,
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

  const state: VisualizerVizDefinitionWithColumns = {
    display: mainCard.display,
    columns: [],
    columnValuesMapping: {},
    settings: {},
  };

  const dataSources = rawSeries.map(({ card }) =>
    createDataSource("card", card.entity_id, card.name),
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

  const settingsFromAllCards = rawSeries.map((series, seriesIndex) =>
    mapColumnVizSettings(series.card, allColumnInfos[seriesIndex]),
  );

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
    ...mainCard.visualization_settings,
    ...mergedSettings,
    "card.title": mainCard.name,
  };

  return state;
}
