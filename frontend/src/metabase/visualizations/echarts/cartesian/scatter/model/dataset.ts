import {
  INDEX_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { RawSeries, RowValue } from "metabase-types/api";

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

        let breakoutIndexes: number[] | undefined = undefined;
        if (
          "breakout" in columnDescs &&
          columnDescs.breakout.breakoutDimensions.length > 0
        ) {
          breakoutIndexes = columnDescs.breakout.breakoutDimensions.map(
            (b) => b.index,
          );
        }

        let breakoutValue: RowValue | undefined = undefined;
        if (breakoutIndexes && breakoutIndexes.length > 0) {
          breakoutValue = breakoutIndexes.map((idx) => row[idx]).join(" - ");
        }

        const seriesKey =
          !breakoutIndexes || breakoutIndexes.length === 0
            ? getDatasetKey(column, card.id)
            : getDatasetKey(column, card.id, breakoutValue);

        datum[seriesKey] = value;
      });

      dataset.push(datum);
    });
  });

  return dataset;
}
