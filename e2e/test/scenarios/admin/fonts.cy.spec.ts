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

// Everything the page can draw: text nodes, hidden ones included, the text of
// form fields, and the content of pseudo-elements.
const drawnText = (win: Window) => {
  const walker = win.document.createTreeWalker(win.document, 4);
  const parts: string[] = [];
  while (walker.nextNode()) {
    parts.push(walker.currentNode.textContent ?? "");
  }
  win.document.querySelectorAll("*").forEach((element) => {
    parts.push(
      element.getAttribute("placeholder") ?? "",
      element.getAttribute("value") ?? "",
      element.getAttribute("alt") ?? "",
      win.getComputedStyle(element, "::before").content,
      win.getComputedStyle(element, "::after").content,
      win.getComputedStyle(element, "::marker").content,
    );
  });
  return parts.join("");
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
    const loadedByScript: string[] = [];
    const everInPage: string[] = [];
    const fontLoads: string[] = [];
    cy.visit("/", {
      onBeforeLoad: (win) => {
        const recordText = (target: object, method: string) => {
          const original: (...args: unknown[]) => unknown = Reflect.get(
            target,
            method,
          );
          Reflect.set(
            target,
            method,
            function (this: unknown, ...args: unknown[]) {
              measuredOnCanvas.push(String(args[0]));
              return Reflect.apply(original, this, args);
            },
          );
        };
        [
          win.CanvasRenderingContext2D.prototype,
          win.OffscreenCanvasRenderingContext2D.prototype,
        ].forEach((context) => {
          recordText(context, "measureText");
          recordText(context, "fillText");
          recordText(context, "strokeText");
        });

        // Text that is gone again by the time the page settles.
        new win.MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            const texts = [
              mutation.target.textContent ?? "",
              ...Array.from(
                mutation.addedNodes,
                (node) => node.textContent ?? "",
              ),
            ];
            everInPage.push(texts.join("").replace(/[ -\u00ff\s]/g, ""));
          });
        }).observe(win.document, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        win.document.fonts.addEventListener("loading", () => {
          fontLoads.push(
            `started at ${Math.round(win.performance.now())}ms with "${win.document.body?.innerText.slice(0, 80).replace(/\n/g, " | ")}"`,
          );
        });
        win.document.fonts.addEventListener("loadingdone", (event) => {
          fontLoads.push(
            `done: ${event.fontfaces.map((face) => `${face.family} ${face.weight} ${face.unicodeRange.slice(0, 7)}`).join(", ")}`,
          );
        });

        const caller = () => new Error().stack?.split("\n")[3]?.trim() ?? "";
        const loadFace = win.FontFace.prototype.load;
        win.FontFace.prototype.load = function () {
          loadedByScript.push(`${this.family} ${this.weight} ${caller()}`);
          return loadFace.call(this);
        };
        const loadFont = win.document.fonts.load;
        win.document.fonts.load = (font, text) => {
          loadedByScript.push(`${font} "${text ?? ""}" ${caller()}`);
          return loadFont.call(win.document.fonts, font, text);
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
          `script chunks downloaded. Characters outside the latin chunk: ${charactersOutside(
            latinChunk?.unicodeRange ?? "",
            drawnText(win) + measuredOnCanvas.join("") + everInPage.join(""),
          ).join(
            " ",
          )}. Faces loaded by a script: ${loadedByScript.join(", ")}. Font loads: ${fontLoads.join(" / ")}`,
        ).to.deep.equal([]);
      }),
    );
  });
});
