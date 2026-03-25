/**
 * Resolves a CSS font-size value from em units to px, given a base font size
 * in px. This is needed because measurement containers are appended to
 * document.body, where em values would resolve against the body's font-size
 * instead of the embedding SDK root's font-size.
 *
 * The conversion is only performed when baseFontSize is in px, since we can
 * only do reliable arithmetic with known absolute units.
 */
export function resolveFontSizeToPx(
  fontSize: string,
  baseFontSize?: string,
): string {
  if (
    !baseFontSize ||
    !baseFontSize.endsWith("px") ||
    !fontSize.endsWith("em") ||
    fontSize.endsWith("rem")
  ) {
    return fontSize;
  }

  const emValue = parseFloat(fontSize);
  const baseValue = parseFloat(baseFontSize);

  if (isNaN(emValue) || isNaN(baseValue)) {
    return fontSize;
  }

  const pxValue = Math.round(emValue * baseValue * 100) / 100;
  return `${pxValue}px`;
}
