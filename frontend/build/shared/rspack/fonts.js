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
// This is Google's own latin subset. Its scattered singletons are not noise:
// the arrows, the true minus and the euro turn up in otherwise-latin text, and
// a chart that renders one with the second chunk still in flight measures the
// fallback's metrics and lays itself out around them.
//
// Two chunks rather than Google's seven. Measured across Noto Sans, Inter,
// Roboto and PT Sans, a third cost 19-52 kB more for a latin page 28 bytes
// smaller, and folding latin-ext into the first more than doubled it.
const LATIN_RANGES = [
  [0x20, 0xff],
  [0x131, 0x131],
  [0x152, 0x153],
  [0x2bb, 0x2bc],
  [0x2c6, 0x2c6],
  [0x2da, 0x2da],
  [0x2dc, 0x2dc],
  [0x2000, 0x206f],
  [0x2074, 0x2074],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

const LAST_CODEPOINT = 0x10ffff;

/** Everything the latin set leaves out, so the two together cover the plane. */
const REST_RANGES = (() => {
  const ranges = [];
  let from = null;
  const claimed = new Set();
  for (const [low, high] of LATIN_RANGES) {
    for (let codePoint = low; codePoint <= high; codePoint++) {
      claimed.add(codePoint);
    }
  }
  for (let codePoint = 0x20; codePoint <= LAST_CODEPOINT; codePoint++) {
    const wanted = !claimed.has(codePoint);
    if (wanted && from === null) {
      from = codePoint;
    } else if (!wanted && from !== null) {
      ranges.push([from, codePoint - 1]);
      from = null;
    }
  }
  if (from !== null) {
    ranges.push([from, LAST_CODEPOINT]);
  }
  return ranges;
})();

const hex = (codePoint) => "U+" + codePoint.toString(16).toUpperCase();

const unicodeRange = (ranges) =>
  ranges
    .map(([from, to]) => (from === to ? hex(from) : `${hex(from)}-${hex(to)}`))
    .join(", ");

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

// The rest set spans a million codepoints and every face asks for it.
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
