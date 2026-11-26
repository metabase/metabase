const { H } = cy;

// The browser's own default when a face declares no `unicode-range`, and what
// it falls back to when it cannot parse the one the face does declare.
const EVERY_CODEPOINT = "U+0-10FFFF";

// More than a page of the app requests, so no font request falls out of the
// buffer before the test reads it.
const RESOURCE_TIMING_BUFFER_SIZE = 2000;

const declaredRanges = (win: Window) => {
  const ranges: string[] = [];
  win.document.fonts.forEach((face) => ranges.push(face.unicodeRange));
  return ranges;
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
      const ranges = declaredRanges(win);

      expect(ranges, "bundled faces are declared").not.to.be.empty;
      expect(
        ranges.filter((range) => range === EVERY_CODEPOINT),
        `a face matching ${EVERY_CODEPOINT} means the browser rejected its unicode-range`,
      ).to.be.empty;
    });
  });

  // This reads the requests and not `FontFace.status`. On a machine that has
  // the font installed, `local()` satisfies both chunks of a face at once, and
  // both report `loaded` although nothing was downloaded.
  it("downloads no script chunk for a page with no other script", () => {
    cy.visit("/", {
      onBeforeLoad: (win) =>
        win.performance.setResourceTimingBufferSize(
          RESOURCE_TIMING_BUFFER_SIZE,
        ),
    });
    H.main().should("be.visible");

    cy.window().then((win) =>
      win.document.fonts.ready.then(() => {
        const scriptChunks = win.performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.includes("/fonts/") && url.includes(".rest."));

        expect(scriptChunks).to.deep.equal([]);
      }),
    );
  });
});
