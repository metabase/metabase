/** Convert content pixels to whole grid rows, including inter-row margins. */
export function applyAutoHeights(
  layout: ReactGridLayout.Layout[],
  heights: Record<string, number>,
  rowHeight: number,
  margin: number,
): ReactGridLayout.Layout[] {
  return layout.map((item) => {
    const height = heights[item.i];
    if (!Number.isFinite(height) || height <= 0) {
      return item;
    }
    return {
      ...item,
      h: Math.max(1, Math.ceil((height + margin) / (rowHeight + margin))),
      minH: 1,
    };
  });
}
