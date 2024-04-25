import { measureTextWidth, truncateText } from "metabase/static-viz/lib/text";

import {
  LEGEND_CIRCLE_MARGIN_RIGHT,
  LEGEND_CIRCLE_SIZE,
  LEGEND_ITEM_MARGIN_RIGHT,
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

export const calculateLegendRows = (
  items: LegendItem[],
  width: number,
  lineHeight: number,
  fontSize: number,
  fontWeight: number,
) => {
  if (items.length <= 1) {
    return null;
  }

  const rows: PositionedLegendItem[][] = [[]];

  let currentRowX = 0;

  for (const item of items) {
    const currentRowIndex = rows.length - 1;
    const currentRow = rows[currentRowIndex];
    const hasItemsInCurrentRow = currentRow.length > 0;
    const availableRowWidth = width - currentRowX;

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
          left: 0,
          top: (currentRowIndex + 1) * lineHeight,
        },
      ]);
      currentRowX = itemWidth + LEGEND_ITEM_MARGIN_RIGHT;
    } else {
      currentRow.push({
        color: item.color,
        name: truncateText(item.name, width, fontSize, fontWeight),
        left: 0,
        top: currentRowIndex * lineHeight,
      });

      currentRowX = width;
    }
  }

  const height = rows.length * lineHeight;

  return {
    height,
    items: rows.flat(),
  };
};
