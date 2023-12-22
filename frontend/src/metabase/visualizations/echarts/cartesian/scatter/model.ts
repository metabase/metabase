import type { RawSeries, RowValue } from "metabase-types/api";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";

import type { DataKey } from "../model/types";
import { getDatasetKey } from "../model/dataset";

export function getScatterPlotDataset(
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
): Record<DataKey, RowValue>[] {
  const dataset: Record<DataKey, RowValue>[] = [];

  rawSeries.forEach((cardSeries, index) => {
    const {
      card,
      data: { rows, cols },
    } = cardSeries;
    const columnDescs = cardsColumns[index];

    rows.forEach(row => {
      const datum: Record<DataKey, RowValue> = {};

      cols.forEach((column, columnIndex) => {
        const rowValue = row[columnIndex];
        datum[getDatasetKey(column, card.id)] = rowValue;

        const breakoutIndex =
          "breakout" in columnDescs ? columnDescs.breakout.index : undefined;
        if (breakoutIndex != null) {
          datum[getDatasetKey(column, card.id, row[breakoutIndex])] = rowValue;
        }
      });

      dataset.push(datum);
    });
  });

  return dataset;
}
