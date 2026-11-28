import type { ListItemWidths } from "./use-list-item-widths";

/**
 * Indexes, in order, of the items that fit on one row when the list is
 * collapsed. Items `isPriority` marks get the space first, then the rest, each
 * in order and skipping any that don't fit. The row always gets one item.
 */
export function getCollapsedRowItemIndexes({
  itemWidths,
  availableWidth,
  gap,
  isPriority,
}: ListItemWidths & {
  isPriority: boolean[];
}): number[] {
  const indexes = itemWidths.map((_width, index) => index);
  const indexesByPriority = [
    ...indexes.filter((index) => isPriority[index]),
    ...indexes.filter((index) => !isPriority[index]),
  ];

  const { rowIndexes } = indexesByPriority.reduce(
    ({ rowIndexes, rowWidth }, index) => {
      const isFirst = rowIndexes.length === 0;
      const widthWithItem = isFirst
        ? itemWidths[index]
        : rowWidth + gap + itemWidths[index];

      return isFirst || widthWithItem <= availableWidth
        ? { rowIndexes: [...rowIndexes, index], rowWidth: widthWithItem }
        : { rowIndexes, rowWidth };
    },
    { rowIndexes: new Array<number>(), rowWidth: 0 },
  );

  return rowIndexes.sort((a, b) => a - b);
}
