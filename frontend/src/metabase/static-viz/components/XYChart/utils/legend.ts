import { measureText } from "metabase/static-viz/lib/text";
import { LEGEND_TEXT_MARGIN } from "metabase/static-viz/components/XYChart/constants";
import { Series } from "metabase/static-viz/components/XYChart/types";
import { partitionByYAxis } from "metabase/static-viz/components/XYChart/utils";

const calculateLegendItemHeight = (
  label: string,
  maxTextWidth: number,
  lineHeight: number,
  fontSize: number,
) => {
  const linesCount = Math.ceil(measureText(label, fontSize) / maxTextWidth);
  return linesCount * lineHeight;
};

const calculateLegendColumn = (
  columnSeries: Series[],
  maxTextWidth: number,
  lineHeight: number,
  fontSize: number,
) => {
  let currentOffset = 0;

  const items = columnSeries.map(series => {
    const item = {
      color: series.color,
      label: series.name,
      top: currentOffset,
    };

    currentOffset += calculateLegendItemHeight(
      item.label,
      maxTextWidth,
      lineHeight,
      fontSize,
    );

    return item;
  });

  return {
    items,
    columnHeight: currentOffset,
  };
};

export const calculateLegendItems = (
  series: Series[],
  width: number,
  lineHeight: number,
  fontSize: number,
) => {
  const columnWidth = width / 2;
  const maxTextWidth = columnWidth - LEGEND_TEXT_MARGIN * 2;
  const [leftSeries, rightSeries] = partitionByYAxis(series);

  if (leftSeries?.length > 0 && rightSeries?.length > 0) {
    const leftColumn = calculateLegendColumn(
      leftSeries,
      maxTextWidth,
      lineHeight,
      fontSize,
    );
    const rightColumn = calculateLegendColumn(
      rightSeries,
      maxTextWidth,
      lineHeight,
      fontSize,
    );

    return {
      leftItems: leftColumn.items,
      rightItems: rightColumn.items,
      height: Math.max(leftColumn.columnHeight, rightColumn.columnHeight),
      columnWidth,
      maxTextWidth,
    };
  }

  const singleColumnSeries = leftSeries?.length > 0 ? leftSeries : rightSeries;

  if (singleColumnSeries.length < 2) {
    return {
      height: 0,
      columnWidth: 0,
      maxTextWidth: 0,
    };
  }

  const singleColumnTextWidth = width - LEGEND_TEXT_MARGIN * 2;
  const leftColumn = calculateLegendColumn(
    singleColumnSeries,
    singleColumnTextWidth,
    lineHeight,
    fontSize,
  );

  return {
    leftItems: leftColumn.items,
    height: leftColumn.columnHeight,
    columnWidth: singleColumnTextWidth,
    maxTextWidth: singleColumnTextWidth,
  };
};
