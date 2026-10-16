import { patchDominantBaseline, replaceFunctionalColors } from "./svg";

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

describe("replaceFunctionalColors", () => {
  it("should rewrite hsl/hsla/rgb/rgba attribute values to hex", () => {
    const svg = `<svg><text fill="hsla(0, 0%, 100%, 0.95)" stroke="hsl(208, 95%, 42%)">a</text><rect fill="rgba(255, 255, 255, 0.5)" stroke="rgb(80, 158, 227)"/></svg>`;

    expect(replaceFunctionalColors(svg)).toBe(
      `<svg><text fill="#FFFFFF" stroke="#0572D1">a</text><rect fill="#FFFFFF" stroke="#509EE3"/></svg>`,
    );
  });

  it("should leave hex colors, keywords, and text content alone", () => {
    const svg = `<svg><text fill="#509ee3" stroke="none">hsla(0, 0%, 100%, 0.95)</text></svg>`;

    expect(replaceFunctionalColors(svg)).toBe(svg);
  });
});

describe("patchDominantBaseline", () => {
  it(`should add "dy='0.5em'" to all text nodes with "dominant-baseline='central'`, () => {
    const patchedSvgStr = patchDominantBaseline(SVG_STR);
    const doc = new DOMParser().parseFromString(patchedSvgStr, "image/svg+xml");
    const dyOf = (id: string) =>
      doc.querySelector(`[id="${id}"]`)?.getAttribute("dy") ?? undefined;

    expect(dyOf(OUTER_TEXT)).toBe("0.5em");
    expect(dyOf(G_ELEM)).toBe(undefined);
    expect(dyOf(IN_FIRST_G)).toBe("0.5em");
    expect(dyOf(WITHOUT_DOMINANT_BASELINE)).toBe(undefined);
    expect(dyOf(DEEPLY_NESTED)).toBe("0.5em");
  });
});
