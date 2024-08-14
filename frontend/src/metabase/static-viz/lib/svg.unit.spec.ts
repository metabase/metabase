import type { Element, ElementContent } from "hast";
import { fromHtml } from "hast-util-from-html";

import { patchDominantBaseline } from "./svg";

const OUTER_TEXT = "outer-text";
const G_ELEM = "g-elem";
const IN_FIRST_G = "in-first-g";
const WITHOUT_DOMINANT_BASELINE = "without-dominant-baseline";
const DEEPLY_NESTED = "deeply-nested";

const SVG_STR = `<svg width="500" height="500">
  <text
    id="${OUTER_TEXT}"
    fill="black"
    dominant-baseline="central"
    transform="translate(50 50)"
  >
    Outer text
  </text>
  <g id="${G_ELEM}">
    <text
      id="${IN_FIRST_G}"
      fill="black"
      transform="translate(100 100)"
      dominant-baseline="central"
    >
      In first g
    </text>
    <g>
      <g>
        <text
          id="${WITHOUT_DOMINANT_BASELINE}"
          fill="black"
          transform="translate(150 150)"
        >
          Without dominant-baseline
        </text>
        <g>
          <text
            id="${DEEPLY_NESTED}"
            fill="black"
            transform="translate(200 200)"
            dominant-baseline="central"
          >
            In deeply nested g
          </text>
        </g>
      </g>
    </g>
  </g>
</svg>
`;

describe("patchDominantBaseline", () => {
  it(`should add "dy='0.5em'" to all text nodes with "dominant-baseline='central'`, () => {
    const patchedSvgStr = patchDominantBaseline(SVG_STR);
    const patchedSvgElem = fromHtml(patchedSvgStr, {
      fragment: true,
      space: "svg",
    }).children[0] as Element;

    const nodes: Record<string, Element> = {};
    function recordNode(node: ElementContent) {
      if (node.type !== "element") {
        return;
      }

      if (typeof node.properties.id === "string") {
        nodes[node.properties.id] = node;
      }

      node.children.forEach(child => recordNode(child));
    }
    recordNode(patchedSvgElem);

    expect(nodes[OUTER_TEXT].properties.dy).toBe("0.5em");
    expect(nodes[G_ELEM].properties.dy).toBe(undefined);
    expect(nodes[IN_FIRST_G].properties.dy).toBe("0.5em");
    expect(nodes[WITHOUT_DOMINANT_BASELINE].properties.dy).toBe(undefined);
    expect(nodes[DEEPLY_NESTED].properties.dy).toBe("0.5em");
  });
});
