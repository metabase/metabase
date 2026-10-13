import { GRID_WIDTH } from "metabase/utils/dashboard_grid";

import type { SummaryBlock, SummaryBlockLayout } from "./types";

export const CANVAS_COLUMNS = GRID_WIDTH;

const NUMBER_SIZE = { w: 6, h: 4 };
const DEFAULT_SIZE = { w: 12, h: 8 };

function getDefaultSize(block: Pick<SummaryBlock, "rows" | "columns">) {
  const isNumber = block.rows.length === 0 && block.columns.length === 0;
  return isNumber ? NUMBER_SIZE : DEFAULT_SIZE;
}

function overlaps(a: SummaryBlockLayout, b: SummaryBlockLayout) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * The first free spot for `block`, scanning the grid top to bottom and left to right.
 * Keeps the block's size when it already has one.
 */
export function getNextBlockLayout(
  blocks: readonly Pick<SummaryBlock, "layout">[],
  block: Pick<SummaryBlock, "rows" | "columns" | "layout">,
): SummaryBlockLayout {
  const { w, h } =
    block.layout.w > 0 && block.layout.h > 0
      ? block.layout
      : getDefaultSize(block);
  const bottom = Math.max(
    0,
    ...blocks.map(({ layout }) => layout.y + layout.h),
  );

  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + w <= CANVAS_COLUMNS; x++) {
      const candidate = { x, y, w, h };
      if (blocks.every(({ layout }) => !overlaps(layout, candidate))) {
        return candidate;
      }
    }
  }
  return { x: 0, y: bottom, w, h };
}
