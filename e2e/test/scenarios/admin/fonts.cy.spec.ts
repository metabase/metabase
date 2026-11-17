const { H } = cy;

// The browser's own default when a face declares no `unicode-range`, and what
// it falls back to when it cannot parse the one the face does declare.
const EVERY_CODEPOINT = "U+0-10FFFF";

// How the browser writes back the range of the chunk a latin page draws from.
const LATIN_CHUNK_RANGE_START = "U+20-FF";

const charactersOutside = (unicodeRange: string, text: string) => {
  const ranges = unicodeRange.split(",").map((token) => {
    const [from, to = from] = token.trim().replace("U+", "").split("-");
    return { from: parseInt(from, 16), to: parseInt(to, 16) };
  });
  const codePoints = Array.from(text, (character) => character.codePointAt(0))
    .filter((codePoint) => codePoint !== undefined)
    .filter((codePoint) => codePoint >= 0x20)
    .filter(
      (codePoint) =>
        !ranges.some(({ from, to }) => from <= codePoint && codePoint <= to),
    );
  return [...new Set(codePoints)].map(
    (codePoint) => `U+${codePoint.toString(16).toUpperCase()}`,
  );
};

const bundledFaces = (win: Window) => {
  const faces: FontFace[] = [];
  win.document.fonts.forEach((face) => faces.push(face));
  return faces;
};

describe("scenarios > admin > fonts", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  // Every bundled face is split in two and gated by a `unicode-range`. A
  // browser silently drops a descriptor it cannot parse, and the face then
  // matches every codepoint, so both halves of a family come into use on every
  // page. Nothing renders differently when that happens, which is why this
  // asserts the descriptor rather than the pixels.
  it("gates every bundled font face behind a unicode-range the browser accepts", () => {
    cy.visit("/");
    H.main().should("be.visible");

    cy.window().then((win) => {
      const ranges = bundledFaces(win).map((face) => face.unicodeRange);

      expect(ranges, "bundled faces are declared").not.to.be.empty;
      expect(
        ranges.filter((range) => range === EVERY_CODEPOINT),
        `a face matching ${EVERY_CODEPOINT} means the browser rejected its unicode-range`,
      ).to.be.empty;
    });
  });

  it("downloads only the latin chunk for a page with no other script", () => {
    // A canvas measurement downloads a chunk just as rendered text does, and
    // leaves nothing in the page to find it by.
    const measuredOnCanvas: string[] = [];
    cy.visit("/", {
      onBeforeLoad: (win) => {
        const measureText = win.CanvasRenderingContext2D.prototype.measureText;
        win.CanvasRenderingContext2D.prototype.measureText = function (text) {
          measuredOnCanvas.push(text);
          return measureText.call(this, text);
        };
      },
    });
    H.main().should("be.visible");

    cy.window().then((win) =>
      win.document.fonts.ready.then(() => {
        const downloaded = bundledFaces(win).filter(
          (face) => face.status === "loaded",
        );
        const scriptChunks = downloaded.filter(
          (face) => !face.unicodeRange.startsWith(LATIN_CHUNK_RANGE_START),
        );
        const latinChunk = downloaded.find((face) =>
          face.unicodeRange.startsWith(LATIN_CHUNK_RANGE_START),
        );

        expect(latinChunk, "the page drew text in a bundled face").to.exist;
        expect(
          scriptChunks.map((face) => `${face.family} ${face.weight}`),
          `script chunks downloaded, for these characters in the page or measured on a canvas: ${charactersOutside(
            latinChunk?.unicodeRange ?? "",
            win.document.body.innerText + measuredOnCanvas.join(""),
          ).join(" ")}`,
        ).to.deep.equal([]);
      }),
    );
  });
});
