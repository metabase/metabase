/**
 * Resolves a CSS font-size value from em units to px, given a base font size
 * in px. This is needed because measurement containers are appended to
 * document.body, where em values would resolve against the body's font-size
 * instead of the embedding SDK root's font-size.
 *
 * Only em values are converted — rem values are left as-is because they always
 * resolve against the root <html> element regardless of DOM position, so they
 * produce the same px result in both the measurement container and the actual
 * rendered table.
 *
 * The conversion is only performed when baseFontSize is in px, since we can
 * only do reliable arithmetic with known absolute units.
 */
export function resolveFontSizeToPx(
  fontSize: string,
  baseFontSize?: string,
): string {
  const isRem = fontSize.endsWith("rem");
  const isEm = fontSize.endsWith("em") && !isRem;

  if (!isEm) {
    console.warn(
      `resolveFontSizeToPx: fontSize "${fontSize}" is not in em. ` +
        `Column width measurement may be inaccurate.`,
    );
    return fontSize;
  }

  if (!baseFontSize || !baseFontSize.endsWith("px")) {
    console.warn(
      `resolveFontSizeToPx: cannot convert "${fontSize}" to px — ` +
        `baseFontSize ${baseFontSize ? `"${baseFontSize}" is not in px` : "is not provided"}. ` +
        `Column width measurement may be inaccurate.`,
    );
    return fontSize;
  }

  const emValue = parseFloat(fontSize);
  const baseValue = parseFloat(baseFontSize);

  if (isNaN(emValue) || isNaN(baseValue)) {
    console.warn(
      `resolveFontSizeToPx: cannot parse "${fontSize}" or "${baseFontSize}" as numbers. ` +
        `Column width measurement may be inaccurate.`,
    );
    return fontSize;
  }

  const pxValue = Math.round(emValue * baseValue * 100) / 100;
  return `${pxValue}px`;
}
