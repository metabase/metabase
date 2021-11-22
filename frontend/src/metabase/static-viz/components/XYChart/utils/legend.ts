import { measureText } from "metabase/static-viz/lib/text";
import { LEGEND_TEXT_MARGIN } from "../constants";
import { Series } from "../types";
import { partitionByYAxis } from "./series";

const calculateLegendItemHeight = (
  label: string,
  maxTextWidth: number,
  lineHeight: number,
) => {
  const linesCount = Math.ceil(measureText(label) / maxTextWidth);
  return linesCount * lineHeight;
};

const calculateLegendColumn = (
  columnSeries: Series[],
  maxTextWidth: number,
  lineHeight: number,
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
) => {
  const columnWidth = width / 2
  const maxTextWidth = columnWidth - LEGEND_TEXT_MARGIN * 2;
  const [leftColumn, rightColumn] = partitionByYAxis(series).map(columnSeries =>
    calculateLegendColumn(columnSeries, maxTextWidth, lineHeight),
  );

  return {
    leftItems: leftColumn?.items,
    rightItems: rightColumn?.items,
    height: Math.max(leftColumn?.columnHeight, rightColumn?.columnHeight),
    columnWidth,
    maxTextWidth,
  }
};
