const fs = require("fs");
const path = require("path");

const fontverter = require("fontverter");

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

// The rest set spans a million codepoints and every face asks for it, so both
// are built on first use and kept.
let latin;
let rest;

// --- What a font says about itself ------------------------------------------

// OpenType name table IDs. `local()` matches a font by its full name or its
// PostScript name, so these two are what a @font-face rule has to name.
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
    // Only the Windows records: a Macintosh record may hold UTF-16 while
    // declaring a single-byte encoding, which decodes to nonsense.
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
 * What a face says about itself: the weight it was drawn at and the names a
 * browser will match an installed copy against.
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

// Ordered the way a browser should try them: the first it understands wins.
const FORMATS = [
  { extension: "eot", format: "embedded-opentype" },
  { extension: "woff2", format: "woff2" },
  { extension: "woff", format: "woff" },
  { extension: "ttf", format: "truetype" },
  { extension: "svg", format: "svg" },
];

// The default font is on the critical path of every page, so `swap` there would
// flash a fallback on each load. Every other family is only ever reached by
// whitelabelling, where the flash is the better trade.
const DEFAULT_FAMILY = "Lato";

const quoted = (family) => (family.includes(" ") ? `"${family}"` : family);

const faceUrl = (directory, stem, extension, family) => {
  const fragment = { eot: "?#iefix", svg: `#${family.replace(/ /g, "")}` };
  return `~fonts/${directory}/${stem}.${extension}${fragment[extension] ?? ""}`;
};

const face = ({ directory, family, stem, weight, localNames, extensions }) => {
  const sources = FORMATS.filter((f) => extensions.has(f.extension)).map(
    (f) =>
      `    url("${faceUrl(directory, stem, f.extension, family)}") format("${f.format}")`,
  );
  return [
    "@font-face {",
    `  font-family: ${quoted(family)};`,
    "  font-style: normal;",
    `  font-weight: ${weight};`,
    family === DEFAULT_FAMILY ? null : "  font-display: swap;",
    // A bare `src` first, for browsers that understand no `format()` at all.
    extensions.has("eot")
      ? `  src: url("~fonts/${directory}/${stem}.eot");`
      : null,
    "  src:",
    [...localNames.map((name) => `    local("${name}")`), ...sources].join(
      ",\n",
    ) + ";",
    "}",
  ]
    .filter((line) => line !== null)
    .join("\n");
};

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
 * The bundled `@font-face` rules, built from the fonts themselves. Each face
 * names the weight it was drawn at and the names a browser matches an installed
 * copy against, so the stylesheet cannot drift from the files it describes.
 *
 * @param {string} fontsDir
 * @param {(file: string) => void} onRead called with every file consulted
 */
const buildFontFaces = async (fontsDir, onRead) => {
  const blocks = [];
  for (const directory of familiesIn(fontsDir)) {
    const family = directory.replace(/_/g, " ");
    const inFamily = fs.readdirSync(path.join(fontsDir, directory));
    for (const file of inFamily.filter((f) => f.endsWith(".woff2")).sort()) {
      const stem = path.basename(file, ".woff2");
      const source = path.join(fontsDir, directory, file);
      onRead(source);
      const { weight, localNames } = await readFontMetadata(
        fs.readFileSync(source),
      );
      const extensions = new Set(
        FORMATS.map((f) => f.extension).filter((extension) =>
          inFamily.includes(`${stem}.${extension}`),
        ),
      );
      blocks.push(
        face({ directory, family, stem, weight, localNames, extensions }),
      );
    }
  }
  return blocks.join("\n\n") + "\n";
};

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
  FONT_FACES_VIRTUAL_MODULE,
  LATIN_UNICODE_RANGE: unicodeRange(LATIN_RANGES),
  REST_UNICODE_RANGE: unicodeRange(REST_RANGES),
  latinCharacters: () => (latin ??= characters(LATIN_RANGES)),
  restCharacters: () => (rest ??= characters(REST_RANGES)),
  buildFontFaces,
  fontAssetName,
};
