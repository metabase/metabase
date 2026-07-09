const transformSvgForOutline = (svgString: string) => {
  const regex =
    /<text([^>]*fill="([^"]+)"[^>]*stroke="([^"]+)"[^>]*)>(.*?)<\/text>/g;

  return svgString.replace(
    regex,
    function (match, attributes, fill, stroke, innerText) {
      const strokeElem = `<text${attributes.replace(
        `fill="${fill}"`,
        'fill="none"',
      )}>${innerText}</text>`;
      const fillElem = `<text${attributes
        .replace(`stroke="${stroke}"`, 'stroke="none"')
        .replace(
          `stroke-width="[^"]+"`,
          'stroke-width="0"',
        )}>${innerText}</text>`;

      return strokeElem + fillElem;
    },
  );
};

/**
 * Fixes `<text>` elements not being vertically centered due to Batik not
 * supporting the `dominant-baseline` property. ECharts emits
 * `dominant-baseline="central"`; we add an equivalent `dy` via a string
 * transform instead of a full hast parse/serialize round-trip, which is very
 * slow on large SVGs (~a quarter of a big chart's render time).
 */
export function patchDominantBaseline(svgString: string) {
  return svgString.replace(
    /<text\b[^>]*\bdominant-baseline="central"[^>]*>/g,
    (tag) =>
      /\bdy=/.test(tag) ? tag : tag.replace(/(\/?)>$/, ' dy="0.5em"$1>'),
  );
}

export const sanitizeSvgForBatik = (
  svgString: string,
  isStorybook: boolean,
) => {
  if (isStorybook) {
    return svgString;
  }

  return [transformSvgForOutline, patchDominantBaseline].reduce(
    (currSVGString, transform) => transform(currSVGString),
    svgString,
  );
};
