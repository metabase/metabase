export function convertFontSizeToPx(
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

    return em * parentFontSize;
  }
}

const stripNaN = (value: number): number | undefined =>
  isNaN(value) ? undefined : value;
