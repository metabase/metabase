import { Series } from "metabase/static-viz/components/XYChart/types";
import { partitionByYAxis } from "metabase/static-viz/components/XYChart/utils";

export type LegendItemData = {
  name: string;
  color: string;
};

const getLegendItem = (series: Series): LegendItemData => ({
  name: series.name,
  color: series.color,
});

export const getLegendColumns = (series: Series[]) => {
  if (series.length < 2) {
    return {
      leftColumn: [],
      rightColumn: [],
    };
  }

  let [leftColumn, rightColumn] = partitionByYAxis(series);

  // Always show legend in the left column for a single Y-axis
  if (leftColumn.length === 0) {
    leftColumn = rightColumn;
    rightColumn = [];
  }

  return {
    leftColumn: leftColumn.map(getLegendItem),
    rightColumn: rightColumn.map(getLegendItem),
  };
};
