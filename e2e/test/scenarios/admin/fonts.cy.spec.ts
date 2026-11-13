const { H } = cy;

// The browser's own default when a face declares no `unicode-range`, and what
// it falls back to when it cannot parse the one the face does declare.
const EVERY_CODEPOINT = "U+0-10FFFF";

const BUNDLED_FONT_PATH = "/app/dist/fonts/";

const fetchedFontUrls = (win: Window) =>
  win.performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes(BUNDLED_FONT_PATH));

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
  // matches every codepoint, so both halves of the family download on every
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
        `faces matching ${EVERY_CODEPOINT} means the browser rejected their unicode-range`,
      ).to.be.empty;
    });
  });

  it("downloads only the latin half of the font a latin page renders", () => {
    cy.visit("/");
    H.main().should("be.visible");

    cy.window().then((win) => {
      const fetched = fetchedFontUrls(win);

      expect(fetched, "the page downloads a bundled font").not.to.be.empty;
      expect(
        fetched.filter((url) => url.includes(".rest.")),
        "a page with no Cyrillic or Greek should not download the script half",
      ).to.be.empty;
    });
  });
});
