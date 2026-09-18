import type { RawSeries } from "metabase-types/api";

import type { CartesianChartColumns } from "../../../../lib/graph/columns";
import { INDEX_KEY, X_AXIS_DATA_KEY } from "../../constants/dataset";
import { getDatasetKey } from "../../model/dataset";
import type { ChartDataset, Datum } from "../../model/types";

export function getScatterPlotDataset(
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
): ChartDataset {
  const dataset: Datum[] = [];

  rawSeries.forEach((cardSeries, index) => {
    const {
      card,
      data: { rows, cols },
    } = cardSeries;
    const columnDescs = cardsColumns[index];

    rows.forEach((row, index) => {
      const datum: Datum = { [X_AXIS_DATA_KEY]: null, [INDEX_KEY]: index };

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
