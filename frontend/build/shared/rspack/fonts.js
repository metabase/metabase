// --- How each face is split -------------------------------------------------

// Each bundled face is split in two so a page only downloads what it renders.
// A latin page fetches the first chunk and nothing else, and Cyrillic or Greek
// text pulls the second in on demand, so coverage is unchanged.
//
// The two sets are disjoint and together cover everything above the control
// characters. The second chunk holds only what the first leaves out, so a
// codepoint claimed by both would render tofu whenever the browser picked the
// face that lacks it.
//
// Latin-1 and the punctuation-through-currency span, rather than Google's latin
// subset. That set scatters fifteen singletons across the plane, for the euro,
// dotless i, the arrows and the rest, and its complement comes out just as
// jagged. Rounding to two blocks costs 6,904 bytes on Noto Sans, the largest
// family, and turns seventeen ranges a side into two.
//
// Two ranges rather than Google's seven: measured across Noto Sans, Inter,
// Roboto and PT Sans, a third chunk cost 19-52 kB more in total for a latin
// page 28 bytes smaller, and folding latin-ext into the first chunk more than
// doubled it.
const LATIN_RANGES = [
  [0x20, 0xff],
  [0x2000, 0x20bf],
];

const REST_RANGES = [
  [0x100, 0x1fff],
  [0x20c0, 0x10ffff],
];

const hex = (codePoint) => "U+" + codePoint.toString(16).toUpperCase();

const unicodeRange = (ranges) =>
  ranges.map(([from, to]) => `${hex(from)}-${hex(to)}`).join(", ");

/** Every codepoint in the given ranges, as a string for the subsetter. */
const characters = (ranges) => {
  let out = "";
  for (const [from, to] of ranges) {
    for (let codePoint = from; codePoint <= to; codePoint++) {
      // Surrogates are not characters and throw when built into a string.
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        continue;
      }
      out += String.fromCodePoint(codePoint);
    }
  }
  return out;
};

// The rest set spans a million codepoints and every face asks for it, so both
// are built on first use and kept.
let latin;
let rest;

// --- Where the emitted files land -------------------------------------------

/**
 * Output path for a bundled font, under `prefix`.
 *
 * Keeps the family directory, because the backend derives the whitelabel font
 * list from those names, and drops the cache key the subset loader puts in a
 * chunk's filename. That key exists to invalidate the cache on disk. In a URL
 * the content hash already does that job, and a second hash only makes the name
 * harder to read.
 *
 * The latin chunk takes the name the whole face would have had. It is the one
 * anything outside the stylesheet wants, so every consumer that looked a face
 * up before the split still finds it, and only the second chunk is marked.
 *
 * @param {{ filename: string }} pathData
 * @param {string} prefix
 */
const fontAssetName = (pathData, prefix) => {
  // e.g. frontend/fonts/PT_Serif/PTSerif-Bold.woff2 -> PT_Serif
  const segments = pathData.filename.split("/");
  const family = segments[segments.length - 2];
  const name = segments[segments.length - 1]
    .replace(/\.[^.]+$/, "")
    .replace(/\.[a-f0-9]{12}\.latin$/, "")
    .replace(/\.[a-f0-9]{12}(?=\.rest$)/, "");
  return `${prefix}/${family}/${name}.[contenthash:8][ext]`;
};

module.exports = {
  LATIN_UNICODE_RANGE: unicodeRange(LATIN_RANGES),
  REST_UNICODE_RANGE: unicodeRange(REST_RANGES),
  latinCharacters: () => (latin ??= characters(LATIN_RANGES)),
  restCharacters: () => (rest ??= characters(REST_RANGES)),
  fontAssetName,
};
