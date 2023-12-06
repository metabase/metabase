// eslint-disable-next-line import/no-unresolved -- vscode is confused since only @types/hast is installed
import type { Element, ElementContent } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";

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

/**
 * Recursive ast traversal helper for `patchDominantBaseline`
 */
function patchNode(node: ElementContent) {
  if (node.type !== "element") {
    return;
  }

  if (
    node.tagName === "text" &&
    node.properties.dominantBaseline === "central"
  ) {
    node.properties.dy = "0.5em";
  }

  node.children.forEach(child => patchNode(child));
}

/**
 * Fixes `<text>` elements not being vertically centered due to Batik not
 * supporting the `dominant-baseline` property.
 */
export function patchDominantBaseline(svgString: string) {
  const svgElem = fromHtml(svgString, { fragment: true, space: "svg" })
    .children[0] as Element;

  patchNode(svgElem);

  return toHtml(svgElem, { space: "svg" });
}

/**
 * Removes `xmlns` attributes that Batik does not support
 */
function removeNamespace(svgString: string) {
  return svgString
    .replace('xmlns="http://www.w3.org/2000/svg"', "")
    .replace('xmlns:xlink="http://www.w3.org/1999/xlink"', "");
}

export const sanitizeSvgForBatik = (svgString: string) => {
  return [
    transformSvgForOutline,
    patchDominantBaseline,
    removeNamespace,
  ].reduce((currSVGString, transform) => transform(currSVGString), svgString);
};
