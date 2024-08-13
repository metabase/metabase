import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { RawSeries } from "metabase-types/api";

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

    rows.forEach(row => {
      const datum: Datum = { [X_AXIS_DATA_KEY]: null };

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
