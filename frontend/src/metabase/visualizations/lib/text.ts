import type {
  FontStyle,
  TextWidthMeasurer,
} from "../shared/types/measure-text";

const CHAR_ELLIPSES = "…";

export function truncateText(
  text: string,
  width: number,
  measurer: TextWidthMeasurer,
  fontStyle: FontStyle,
) {
  if (measurer(text, fontStyle) <= width) {
    return text;
  }

  while (text.length && measurer(text + CHAR_ELLIPSES, fontStyle) > width) {
    text = text.substring(0, text.length - 1).trim();
  }

  return text + CHAR_ELLIPSES;
}
