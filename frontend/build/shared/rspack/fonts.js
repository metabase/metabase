const fs = require("fs");
const path = require("path");

const fontverter = require("fontverter");

// --- How each face is split -------------------------------------------------

// A page downloads only the chunks it renders. The two sets are disjoint and
// cover everything above the control characters: the second chunk holds only
// what the first leaves out, so a codepoint claimed by both would render tofu
// whenever the browser picked the face that lacks it.
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

// A family's OpenType features reach well past what anything here asks for:
// small caps, stylistic sets, swashes. Subsetting keeps every glyph those can
// reach, which is half the glyphs in the richer families. These are the ones a
// browser applies to latin text unasked, plus the numeric set `font-variant-
// numeric` can request, so nothing renders differently for dropping the rest.
const KEPT_FEATURES = [
  "ccmp",
  "liga",
  "clig",
  "calt",
  "rlig",
  "locl",
  "kern",
  "mark",
  "mkmk",
  "rvrn",
  "lnum",
  "onum",
  "pnum",
  "tnum",
  "frac",
  "afrc",
  "ordn",
  "zero",
];

// The subsetter drops the `.notdef` outline by default. That is the box a
// browser draws for a character no font in the stack can render, so without it
// a missing glyph turns into blank space and the text silently loses it.
const SUBSET_OPTIONS = {
  targetFormat: "woff2",
  keepFeatures: KEPT_FEATURES,
  notdefOutline: true,
};

/** Cuts a face down to `characters`, the way the build does. */
const subsetFace = async (buf, characters, options = SUBSET_OPTIONS) =>
  (await import("subset-font")).default(buf, characters, options);

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

/** Every codepoint in the ranges, as a string for the subsetter. */
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

// --- What a font says about itself ------------------------------------------

// `local()` matches a font by its full name or its PostScript name.
const FULL_NAME = 4;
const POSTSCRIPT_NAME = 6;

const WINDOWS_PLATFORM = 3;

const tableOffset = (sfnt, tag) => {
  const count = sfnt.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    if (sfnt.toString("latin1", record, record + 4) === tag) {
      return sfnt.readUInt32BE(record + 8);
    }
  }
  return null;
};

const readNames = (sfnt) => {
  const offset = tableOffset(sfnt, "name");
  if (offset === null) {
    return {};
  }
  const table = sfnt.subarray(offset);
  const count = table.readUInt16BE(2);
  const storage = table.readUInt16BE(4);
  const names = {};
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12;
    // A Macintosh record may hold UTF-16 while declaring a single-byte
    // encoding, which decodes to nonsense.
    if (table.readUInt16BE(record) !== WINDOWS_PLATFORM) {
      continue;
    }
    const nameId = table.readUInt16BE(record + 6);
    const length = table.readUInt16BE(record + 8);
    const from = storage + table.readUInt16BE(record + 10);
    names[nameId] = Buffer.from(table.subarray(from, from + length))
      .swap16()
      .toString("utf16le");
  }
  return names;
};

/**
 * The weight a face was drawn at, and the names a browser matches an installed
 * copy against.
 *
 * @param {Buffer} font a woff2, woff or sfnt file
 */
const readFontMetadata = async (font) => {
  const sfnt = await fontverter.convert(font, "truetype");
  const names = readNames(sfnt);
  return {
    weight: sfnt.readUInt16BE(tableOffset(sfnt, "OS/2") + 4),
    localNames: [names[FULL_NAME], names[POSTSCRIPT_NAME]].filter(Boolean),
  };
};

// --- The @font-face rules ---------------------------------------------------

// The browser takes the first it understands.
const FORMATS = { woff2: "woff2", woff: "woff", ttf: "truetype" };

// The default family is the one a stock instance loads, so it keeps a `woff`
// and a `ttf` beside its `woff2`. Both are cut from the same chunk, so they
// cover exactly what the `woff2` covers. Every other family declares only the
// format its source is in.
const FALLBACK_FORMATS = ["woff", "ttf"];

// The default font is on the critical path of every page, so `swap` there
// would flash a fallback on each load.
const DEFAULT_FAMILY = "Lato";

/** The extra container formats a family's chunks are also written in. */
const fallbackFormatsFor = (directory) =>
  directory.replace(/_/g, " ") === DEFAULT_FAMILY ? FALLBACK_FORMATS : [];

/** Re-wraps a chunk in another container format, leaving the glyphs alone. */
const convertFace = (chunk, extension) =>
  fontverter.convert(chunk, extension === "ttf" ? "truetype" : extension);

const quoted = (family) => (family.includes(" ") ? `"${family}"` : family);

const face = ({ directory, family, stem, weight, localNames }) =>
  [
    "@font-face {",
    `  font-family: ${quoted(family)};`,
    "  font-style: normal;",
    `  font-weight: ${weight};`,
    family === DEFAULT_FAMILY ? null : "  font-display: swap;",
    "  src:",
    [
      ...localNames.map((name) => `    local("${name}")`),
      `    url("~fonts/${directory}/${stem}.woff2") format("woff2")`,
    ].join(",\n") + ";",
    "}",
  ]
    .filter((line) => line !== null)
    .join("\n");

const familiesIn = (fontsDir) =>
  fs
    .readdirSync(fontsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) =>
      a.replace(/_/g, " ") === DEFAULT_FAMILY
        ? -1
        : b.replace(/_/g, " ") === DEFAULT_FAMILY
          ? 1
          : a.localeCompare(b),
    );

/**
 * The bundled `@font-face` rules, read out of the fonts, so the stylesheet
 * cannot drift from the files it describes.
 *
 * @param {string} fontsDir
 * @param {(file: string) => void} onRead called with every file consulted
 */
const buildFontFaces = async (fontsDir, onRead) => {
  const blocks = [];
  for (const directory of familiesIn(fontsDir)) {
    const family = directory.replace(/_/g, " ");
    const woff2s = fs
      .readdirSync(path.join(fontsDir, directory))
      .filter((f) => f.endsWith(".woff2"))
      .sort();
    for (const file of woff2s) {
      const stem = path.basename(file, ".woff2");
      const source = path.join(fontsDir, directory, file);
      onRead(source);
      const { weight, localNames } = await readFontMetadata(
        fs.readFileSync(source),
      );
      blocks.push(face({ directory, family, stem, weight, localNames }));
    }
  }
  return blocks.join("\n\n") + "\n";
};

// --- Where the emitted files land -------------------------------------------

/**
 * Output path for a bundled font, under `prefix`.
 *
 * The family directory stays, because the backend derives the whitelabel font
 * list from those names. The loader's cache key does not: the content hash
 * below already tells two versions apart.
 *
 * The latin chunk takes the name the whole face would have had, so anything
 * looking a face up outside the stylesheet finds it, and only the second chunk
 * is marked.
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

// --- Wiring every bundler needs ---------------------------------------------

const ROOT = path.resolve(__dirname, "../../../..");

/**
 * Where `import "fonts.css"` lands. No such file exists: the loader below supplies every rule, so
 * the stylesheet cannot drift from the fonts it describes.
 */
const FONT_FACES_VIRTUAL_MODULE = {
  [path.join(ROOT, "frontend/fonts/fonts.css")]:
    "/* built by the font-subset loader */\n",
};

/**
 * Fills in that module. A `pre` loader, so css-loader sees the rules and resolves their `url()`
 * against the chunks this writes.
 *
 * @type {{
 *   test: RegExp,
 *   enforce: "pre",
 *   use: { loader: string, options: { fontsDir: string, outputDir: string } }[],
 * }}
 */
const FONT_FACES_RULE = {
  test: /[\\/]frontend[\\/]fonts[\\/]fonts\.css$/,
  enforce: "pre",
  use: [
    {
      loader: require.resolve("./loaders/font-subset-loader"),
      options: {
        fontsDir: path.join(ROOT, "frontend/fonts"),
        outputDir: path.join(ROOT, "node_modules/.cache/font-subsets"),
      },
    },
  ],
};

module.exports = {
  FONT_FACES_RULE,
  FORMATS,
  FONT_FACES_VIRTUAL_MODULE,
  LATIN_UNICODE_RANGE: unicodeRange(LATIN_RANGES),
  SUBSET_OPTIONS,
  REST_UNICODE_RANGE: unicodeRange(REST_RANGES),
  latinCharacters: () => (latin ??= characters(LATIN_RANGES)),
  restCharacters: () => (rest ??= characters(REST_RANGES)),
  buildFontFaces,
  subsetFace,
  convertFace,
  fallbackFormatsFor,
  fontAssetName,
};
