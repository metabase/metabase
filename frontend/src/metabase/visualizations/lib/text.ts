import type {
  FontStyle,
  TextWidthMeasurer,
} from "../shared/types/measure-text";

export const CHAR_ELLIPSES = "…";

export function truncateText(
  text: string,
  maxWidth: number,
  measurer: TextWidthMeasurer,
  fontStyle: FontStyle,
) {
  if (measurer(text, fontStyle) <= maxWidth) {
    return text;
  }

  const ellipsisWidth = measurer(CHAR_ELLIPSES, fontStyle);

  const availableWidth = maxWidth - ellipsisWidth;
  if (availableWidth <= 0) {
    return CHAR_ELLIPSES;
  }

  // Binary search to find the longest text that fits
  let left = 0;
  let right = text.length;
  let bestFit = "";

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const truncated = text.slice(0, mid);
    const truncatedWidth = measurer(truncated, fontStyle);

    if (truncatedWidth <= availableWidth) {
      bestFit = truncated;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return bestFit + CHAR_ELLIPSES;
}
