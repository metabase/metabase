/**
 * Resolves a CSS font-size value from em units to px, given a base font size.
 * This is needed because measurement containers are appended to document.body,
 * where em values would resolve against the body's font-size instead of the
 * embedding SDK root's font-size.
 */
export function resolveFontSizeToPx(
  fontSize: string,
  baseFontSize?: string,
): string {
  if (!baseFontSize || !fontSize.endsWith("em") || fontSize.endsWith("rem")) {
    return fontSize;
  }

  const emValue = parseFloat(fontSize);
  const baseValue = parseFloat(baseFontSize);

  if (isNaN(emValue) || isNaN(baseValue)) {
    return fontSize;
  }

  return `${emValue * baseValue}px`;
}
