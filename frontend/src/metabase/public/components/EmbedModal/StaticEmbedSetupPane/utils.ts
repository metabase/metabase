export function getHighlightedRanges(
  source: string,
  highlightedTexts: string[] = [],
) {
  return highlightedTexts.flatMap(highlightedText =>
    getHighlightedRangesForText(source, highlightedText),
  );
}

/**
 * Find all the instances of the highlighted text in the source code
 * and returns the matching ranges.
 */
function getHighlightedRangesForText(
  source: string,
  highlightedText: string,
): { start: number; end: number }[] {
  const res = [];
  for (let index = 0; index < source.length; index++) {
    const start = source.indexOf(highlightedText, index);
    if (start < 0) {
      break;
    }
    index = start;
    res.push({
      start,
      end: start + highlightedText.length,
    });
  }
  return res;
}
