/**
 * Convert string font sizes (e.g. 12px, 25em) to number in pixels.
 *
 * This is useful for visualizations that require font size in pixels,
 * mainly for calculating padding and offsets.
 **/
export function getSizeInPx(
  value?: string | number,
  parentFontSize: number = 16,
): number | undefined {
  if (typeof value !== "string") {
    return value;
  }

  if (value.endsWith("px")) {
    return stripNaN(parseFloat(value));
  }

  if (value.endsWith("em")) {
    const em = stripNaN(parseFloat(value.replace(/em|rem/, "")));

    if (em === undefined) {
      return undefined;
    }

    const emValue = em * parentFontSize;

    return Math.round(emValue * 100) / 100;
  }
}

const stripNaN = (value: number): number | undefined =>
  isNaN(value) ? undefined : value;
