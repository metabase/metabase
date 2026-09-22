// --- How each face is split -------------------------------------------------

// Each bundled face is split in two so a page only downloads what it renders.
// A latin page fetches the first chunk and nothing else; Cyrillic or Greek text
// pulls the second in on demand, so coverage is unchanged.
//
// Two ranges rather than Google's seven: measured across Noto Sans, Inter,
// Roboto and PT Sans, a third chunk cost 19-52 kB more in total for a latin
// page 28 bytes smaller, and folding latin-ext into the first chunk more than
// doubled it.
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

const hex = (n) => "U+" + n.toString(16).toUpperCase();

/** The `unicode-range` descriptor for the latin chunk. */
const LATIN_UNICODE_RANGE = LATIN_RANGES.map(([a, b]) =>
  a === b ? hex(a) : `${hex(a)}-${hex(b)}`,
).join(", ");

/** Every codepoint in the latin chunk, as a string for the subsetter. */
function latinCharacters() {
  let out = "";
  for (const [a, b] of LATIN_RANGES) {
    for (let c = a; c <= b; c++) {
      out += String.fromCodePoint(c);
    }
  }
  return out;
}

/**
 * Every codepoint in the Basic Multilingual Plane that the latin chunk does not
 * claim. The subsetter drops whatever the face does not have, so this needs no
 * per-font glyph inspection.
 */
function restCharacters() {
  const claimed = new Set();
  for (const [a, b] of LATIN_RANGES) {
    for (let c = a; c <= b; c++) {
      claimed.add(c);
    }
  }
  let out = "";
  for (let c = 0x20; c <= 0xffff; c++) {
    // Surrogates are not characters and throw when built into a string.
    if (c >= 0xd800 && c <= 0xdfff) {
      continue;
    }
    if (!claimed.has(c)) {
      out += String.fromCodePoint(c);
    }
  }
  return out;
}

/** The `unicode-range` descriptor for the second chunk: the complement of latin. */
const REST_UNICODE_RANGE = (() => {
  const claimed = new Set();
  for (const [a, b] of LATIN_RANGES) {
    for (let c = a; c <= b; c++) {
      claimed.add(c);
    }
  }
  const parts = [];
  let start = null;
  for (let c = 0x20; c <= 0x10ffff; c++) {
    const want = !claimed.has(c);
    if (want && start === null) {
      start = c;
    }
    if (!want && start !== null) {
      parts.push(start === c - 1 ? hex(start) : `${hex(start)}-${hex(c - 1)}`);
      start = null;
    }
  }
  if (start !== null) {
    parts.push(`${hex(start)}-${hex(0x10ffff)}`);
  }
  return parts.join(", ");
})();

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
  LATIN_RANGES,
  LATIN_UNICODE_RANGE,
  REST_UNICODE_RANGE,
  latinCharacters,
  restCharacters,
  fontAssetName,
};
