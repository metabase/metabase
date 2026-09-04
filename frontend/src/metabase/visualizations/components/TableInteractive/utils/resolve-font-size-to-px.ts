/**
 * Resolves a CSS font-size value from em units to px, given a base font size
 * in px. This is needed because measurement containers are appended to
 * document.body, where em values would resolve against the body's font-size
 * instead of the embedding SDK root's font-size.
 *
 * Any value that isn't an em (px, rem, keywords like `inherit`, etc.) is
 * returned as-is — rem already resolves against the root <html> regardless of
 * DOM position, and px is already in the target unit. The conversion only runs
 * when both the input is em and the baseFontSize is in px, since that is the
 * only case where we can do reliable arithmetic.
 */
export function resolveFontSizeToPx(
  fontSize: string,
  baseFontSize?: string,
): string {
  const isRem = fontSize.endsWith("rem");
  const isEm = fontSize.endsWith("em") && !isRem;

  if (!isEm || !baseFontSize?.endsWith("px")) {
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
