import { measureTextWidth, truncateText } from "metabase/static-viz/lib/text";
import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT,
  DEFAULT_LEGEND_LINE_HEIGHT,
  LEGEND_ITEM_MARGIN_RIGHT_GRID,
} from "./constants";
import type { PositionedLegendItem } from "./types";

const calculateItemWidth = (
  item: LegendItem,
  fontSize: number,
  fontWeight: number,
) => {
  const percentTextWidth =
    item.percent != null
      ? measureTextWidth(item.percent, fontSize, fontWeight)
      : 0;

  return (
    LEGEND_CIRCLE_SIZE +
    LEGEND_CIRCLE_MARGIN_RIGHT +
    measureTextWidth(item.name, fontSize, fontWeight) +
    percentTextWidth
  );
};

interface CalculateLegendInput {
  items: LegendItem[];
  width: number;
  horizontalPadding?: number;
  verticalPadding?: number;

  lineHeight?: number;
  fontSize?: number;
  fontWeight?: number;
  legendItemMarginRight?: number;
  isReversed?: boolean;
}

export const calculateLegendRows = ({
  items,
  width,
  horizontalPadding = 0,
  verticalPadding = 0,
  lineHeight = DEFAULT_LEGEND_LINE_HEIGHT,
  fontSize = DEFAULT_LEGEND_FONT_SIZE,
  fontWeight = DEFAULT_LEGEND_FONT_WEIGHT,
  legendItemMarginRight = LEGEND_ITEM_MARGIN_RIGHT,
  isReversed,
}: CalculateLegendInput) => {
  if (items.length === 0) {
    return {
      items: [],
      height: 0,
      width: 0,
    };
  }

  const orderedItems = isReversed ? items.slice().reverse() : items;

  const availableTotalWidth = width - 2 * horizontalPadding;

  const rows: PositionedLegendItem[][] = [[]];

  let currentRowX = horizontalPadding;

  for (const item of orderedItems) {
    const currentRowIndex = rows.length - 1;
    const currentRow = rows[currentRowIndex];
    const hasItemsInCurrentRow = currentRow.length > 0;
    const availableRowWidth = availableTotalWidth - currentRowX;

    const itemWidth = calculateItemWidth(item, fontSize, fontWeight);

    if (itemWidth <= availableRowWidth) {
      currentRow.push({
        ...item,
        left: currentRowX,
        top: currentRowIndex * lineHeight + verticalPadding,
      });

      currentRowX += itemWidth + legendItemMarginRight;
      continue;
    }

    if (hasItemsInCurrentRow) {
      rows.push([
        {
          ...item,
          left: horizontalPadding,
          top: (currentRowIndex + 1) * lineHeight + verticalPadding,
        },
      ]);
      currentRowX = horizontalPadding + itemWidth + legendItemMarginRight;
    } else {
      currentRow.push({
        key: item.key,
        color: item.color,
        name: truncateText(
          item.name,
          availableTotalWidth,
          fontSize,
          fontWeight,
        ),
        left: horizontalPadding,
        top: currentRowIndex * lineHeight + verticalPadding,
      });

      currentRowX = availableTotalWidth;
    }
  }

  const renderedWidth = Math.max(
    ...rows.map(row =>
      row.reduce(
        (currRowWidth, item) =>
          currRowWidth +
          calculateItemWidth(item, fontSize, fontWeight) +
          legendItemMarginRight,
        0,
      ),
    ),
  );

  const height = rows.length * lineHeight + verticalPadding * 2;

  return {
    height,
    width: renderedWidth,
    items: rows.flat(),
  };
};

function calculateNumRowsCols(
  items: LegendItem[],
  width: number,
  fontSize: number,
  fontWeight: number,
  legendItemMarginRight: number,
) {
  let colWidth: number;
  let numCols = 2;

  do {
    if (numCols >= items.length) {
      return { numRows: 1, numCols: items.length };
    }

    colWidth = Math.floor(width / ++numCols);
  } while (
    items.every(
      item =>
        calculateItemWidth(item, fontSize, fontWeight) +
          legendItemMarginRight <=
        colWidth,
    )
  );
  numCols--; // This value failed the test, so we decrement to the last passing value

  const numRows = Math.ceil(items.length / numCols);

  // If the last column(s) will end up empty, reduce the number of columns
  const numSlots = numRows * numCols;
  const numEmptySlots = numSlots - items.length;
  if (numEmptySlots >= numRows) {
    numCols -= Math.floor(numEmptySlots / numRows);
  }

  return { numRows, numCols };
}

export const calculateLegendRowsWithColumns = ({
  items,
  width,
  horizontalPadding = 0,
  verticalPadding = 0,
  lineHeight = DEFAULT_LEGEND_LINE_HEIGHT,
  fontSize = DEFAULT_LEGEND_FONT_SIZE,
  fontWeight = DEFAULT_LEGEND_FONT_WEIGHT,
  legendItemMarginRight = LEGEND_ITEM_MARGIN_RIGHT_GRID,
  isReversed,
}: CalculateLegendInput) => {
  if (items.length === 0) {
    return {
      items: [],
      height: 0,
      width: 0,
    };
  }

  const orderedItems = isReversed ? items.slice().reverse() : items;

  const availableTotalWidth = width - 2 * horizontalPadding;

  const { numRows, numCols } = calculateNumRowsCols(
    orderedItems,
    availableTotalWidth,
    fontSize,
    fontWeight,
    legendItemMarginRight,
  );

  if (numRows === 1) {
    return calculateLegendRows({
      items,
      width,
      horizontalPadding,
      verticalPadding,
      lineHeight,
      fontSize,
      fontWeight,
      isReversed,
    });
  }

  const colWidth = Math.floor(availableTotalWidth / numCols);
  const rows: PositionedLegendItem[][] = [...Array(numRows).keys()].map(
    _ => [],
  );

  for (let colIndex = 0; colIndex < numCols; colIndex++) {
    for (let rowIndex = 0; rowIndex < numRows; rowIndex++) {
      const itemIndex = colIndex * numRows + rowIndex;
      if (itemIndex >= orderedItems.length) {
        break;
      }

      rows[rowIndex].push({
        ...orderedItems[itemIndex],
        left: colIndex * colWidth + horizontalPadding,
        top: rowIndex * lineHeight + verticalPadding,
        width: colWidth,
      });
    }
  }

  let renderedWidth;
  const percentInLegend = items[0].percent != null;
  if (percentInLegend) {
    renderedWidth = colWidth * numCols;
  } else {
    const lastColumnWidth = Math.max(
      ...rows.map(row => {
        if (row.length < numCols) {
          return 0;
        }
        return calculateItemWidth(row[numCols - 1], fontSize, fontWeight);
      }),
    );
    renderedWidth = colWidth * (numCols - 1) + lastColumnWidth;
  }
  const height = rows.length * lineHeight + verticalPadding * 2;

  return {
    height,
    width: renderedWidth,
    items: rows.flat(),
  };
};
