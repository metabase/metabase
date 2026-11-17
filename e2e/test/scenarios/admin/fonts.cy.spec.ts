const { H } = cy;

// The browser's own default when a face declares no `unicode-range`, and what
// it falls back to when it cannot parse the one the face does declare.
const EVERY_CODEPOINT = "U+0-10FFFF";

// How the browser writes back the range of the chunk a latin page draws from.
const LATIN_CHUNK_RANGE_START = "U+20-FF";

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
    cy.visit("/");
    H.main().should("be.visible");

    cy.window()
      .then((win) => win.document.fonts.ready.then(() => bundledFaces(win)))
      .then((faces) => {
        const downloadedRanges = faces
          .filter((face) => face.status === "loaded")
          .map((face) => face.unicodeRange);

        expect(downloadedRanges, "the page drew text in a bundled face").not.to
          .be.empty;
        expect(
          downloadedRanges.filter(
            (range) => !range.startsWith(LATIN_CHUNK_RANGE_START),
          ),
          "chunks downloaded for a script the page does not render",
        ).to.be.empty;
      });
  });
});
