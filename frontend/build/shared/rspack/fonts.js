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

// Wider companions for a family whose shipped files are a lean subset. The
// subset loader reads them; they are never declared in their own right.
const COMPANION_DIRECTORY = "full";

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

module.exports = {
  LATIN_UNICODE_RANGE: unicodeRange(LATIN_RANGES),
  REST_UNICODE_RANGE: unicodeRange(REST_RANGES),
  latinCharacters: () => (latin ??= characters(LATIN_RANGES)),
  restCharacters: () => (rest ??= characters(REST_RANGES)),
  buildFontFaces,
  COMPANION_DIRECTORY,
  fontAssetName,
};
