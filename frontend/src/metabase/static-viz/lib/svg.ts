// FIXME: instead of Regex parse svg, update, serialize
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

// Removing xmlns attributes that cause Batik failing to convert svg to png
export const sanitizeSvgForBatik = (svg: string) => {
  return transformSvgForOutline(svg)
    .replace('xmlns="http://www.w3.org/2000/svg"', "")
    .replace('xmlns:xlink="http://www.w3.org/1999/xlink"', "");
};
