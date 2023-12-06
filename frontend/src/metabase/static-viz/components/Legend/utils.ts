import { measureTextWidth, truncateText } from "metabase/static-viz/lib/text";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT,
  DEFAULT_LEGEND_LINE_HEIGHT,
} from "./constants";
import type { LegendItem, PositionedLegendItem } from "./types";

const calculateItemWidth = (
  item: LegendItem,
  fontSize: number,
  fontWeight: number,
) => {
  return (
    LEGEND_CIRCLE_SIZE +
    LEGEND_CIRCLE_MARGIN_RIGHT +
    measureTextWidth(item.name, fontSize, fontWeight)
  );
};

/**
 * Calculates the positions of legend items rendered in rows based on the available width, padding,
 * and font style.
 *
 * @param {LegendItem[]} items - The legend items to be positioned.
 * @param {number} width - The available width for the legend.
 * @param {number} [padding=0] - The padding to be applied on both sides of the legend.
 * @param {number} [lineHeight=DEFAULT_LEGEND_LINE_HEIGHT] - The line height for each row of legend items.
 * @param {number} [fontSize=DEFAULT_LEGEND_FONT_SIZE] - The font size to be used for the legend items.
 * @param {number} [fontWeight=DEFAULT_LEGEND_FONT_WEIGHT] - The font weight to be used for the legend items.
 * @returns {{ items: PositionedLegendItem[]; height: number }} An object containing the total height of the legend
 *                                                              and the flat list of positioned legend items.
 */
export const calculateLegendRows = (
  items: LegendItem[],
  width: number,
  padding = 0,
  lineHeight: number = DEFAULT_LEGEND_LINE_HEIGHT,
  fontSize: number = DEFAULT_LEGEND_FONT_SIZE,
  fontWeight: number = DEFAULT_LEGEND_FONT_WEIGHT,
): { items: PositionedLegendItem[]; height: number } => {
  if (items.length <= 1) {
    return {
      items: [],
      height: 0,
    };
  }

  const availableTotalWidth = width - 2 * padding;

  const rows: PositionedLegendItem[][] = [[]];

  let currentRowX = padding;

  for (const item of items) {
    const currentRowIndex = rows.length - 1;
    const currentRow = rows[currentRowIndex];
    const hasItemsInCurrentRow = currentRow.length > 0;
    const availableRowWidth = availableTotalWidth - currentRowX;

    const itemWidth = calculateItemWidth(item, fontSize, fontWeight);

    if (itemWidth <= availableRowWidth) {
      currentRow.push({
        ...item,
        left: currentRowX,
        top: currentRowIndex * lineHeight,
      });

      currentRowX += itemWidth + LEGEND_ITEM_MARGIN_RIGHT;
      continue;
    }

    if (hasItemsInCurrentRow) {
      rows.push([
        {
          ...item,
          left: padding,
          top: (currentRowIndex + 1) * lineHeight,
        },
      ]);
      currentRowX = padding + itemWidth + LEGEND_ITEM_MARGIN_RIGHT;
    } else {
      currentRow.push({
        color: item.color,
        name: truncateText(
          item.name,
          availableTotalWidth,
          fontSize,
          fontWeight,
        ),
        left: padding,
        top: currentRowIndex * lineHeight,
      });

      currentRowX = availableTotalWidth;
    }
  }

  const height = rows.length * lineHeight;

  return {
    height,
    items: rows.flat(),
  };
};
