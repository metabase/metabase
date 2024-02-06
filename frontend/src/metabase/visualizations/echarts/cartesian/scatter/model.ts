import type { RawSeries, RowValue } from "metabase-types/api";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
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
        const value = row[columnIndex];

        if (columnIndex === columnDescs.dimension.index) {
          datum[X_AXIS_DATA_KEY] = value;
        }
        const seriesKey =
          "breakout" in columnDescs
            ? getDatasetKey(column, card.id, row[columnDescs.breakout.index])
            : getDatasetKey(column, card.id);

        datum[seriesKey] = value;
      });

      dataset.push(datum);
    });
  });

  return dataset;
}
