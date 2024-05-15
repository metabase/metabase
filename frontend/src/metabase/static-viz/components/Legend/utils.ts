import { measureTextWidth, truncateText } from "metabase/static-viz/lib/text";
import type { LegendItem } from "metabase/visualizations/echarts/cartesian/model/types";

import {
  DEFAULT_LEGEND_FONT_SIZE,
  DEFAULT_LEGEND_FONT_WEIGHT,
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT,
  DEFAULT_LEGEND_LINE_HEIGHT,
} from "./constants";
import type { PositionedLegendItem } from "./types";

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

interface CalculateLegendInput {
  items: LegendItem[];
  width: number;
  horizontalPadding?: number;
  verticalPadding?: number;

  lineHeight?: number;
  fontSize?: number;
  fontWeight?: number;
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
  isReversed,
}: CalculateLegendInput): { items: PositionedLegendItem[]; height: number } => {
  if (items.length <= 1) {
    return {
      items: [],
      height: 0,
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

      currentRowX += itemWidth + LEGEND_ITEM_MARGIN_RIGHT;
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
      currentRowX = horizontalPadding + itemWidth + LEGEND_ITEM_MARGIN_RIGHT;
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

  const height = rows.length * lineHeight + verticalPadding * 2;

  return {
    height,
    items: rows.flat(),
  };
};
