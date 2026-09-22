/* eslint-env node */
/* eslint-disable import/no-commonjs */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  LATIN_UNICODE_RANGE,
  REST_UNICODE_RANGE,
  latinCharacters,
  restCharacters,
} = require("../fonts");

const PLUGIN = "FontSubsetPlugin";

// A face with nothing outside latin still subsets to a small valid font. Below
// this it carries no real glyphs and declaring it would only add a request that
// renders nothing.
const MIN_USEFUL_CHUNK_BYTES = 3000;

/**
 * Splits each bundled face into a latin chunk and a chunk holding everything
 * else, then rewrites the stylesheet so both are declared with a
 * `unicode-range`. A page downloads only the chunks it renders, and coverage is
 * unchanged because the browser fetches the second chunk on demand.
 *
 * Subsetting a face costs around 100ms, so chunks are cached on disk under the
 * hash of their source. A cold build pays about sixteen seconds, later builds
 * nothing.
 */
class FontSubsetPlugin {
  /**
   * @param {{ source: string, fontsDir: string, outputDir: string }} options
   *   `source` is the hand-written stylesheet, `fontsDir` holds the font
   *   sources, and `outputDir` receives the chunks and rewritten stylesheet.
   */
  constructor({ source, fontsDir, outputDir }) {
    this.source = source;
    this.fontsDir = fontsDir;
    this.outputDir = outputDir;
  }

  apply(compiler) {
    // beforeCompile, so the rewritten stylesheet and its chunks are on disk
    // before css-loader resolves any url() against them.
    compiler.hooks.beforeCompile.tapPromise(PLUGIN, () => this.generate());
  }

  async generate() {
    const subsetFont = (await import("subset-font")).default;
    fs.mkdirSync(this.outputDir, { recursive: true });

    const css = fs.readFileSync(this.source, "utf-8");
    const out = [];
    let cursor = 0;
    let block;
    const blockRe = /@font-face \{[^}]*\}/g;
    while ((block = blockRe.exec(css)) !== null) {
      out.push(css.slice(cursor, block.index));
      cursor = block.index + block[0].length;
      out.push(await this.splitFace(block[0], subsetFont));
    }
    out.push(css.slice(cursor));

    writeAtomic(path.join(this.outputDir, "fonts.css"), out.join(""));
  }

  async splitFace(block, subsetFont) {
    const urls = [...block.matchAll(/url\("~fonts\/([^"]+\.woff2)"\)/g)];
    // Faces that are not a single woff2, such as the legacy Lato fallbacks with
    // their eot and svg sources, are passed through untouched.
    if (urls.length !== 1) {
      return block;
    }
    const rel = urls[0][1];
    if (!fs.existsSync(path.join(this.fontsDir, rel))) {
      return block;
    }

    const { latin, rest } = await this.chunksFor(rel, subsetFont);
    if (!rest) {
      // Nothing outside latin, so a second request would render nothing.
      return block.replace(urls[0][0], `url("~generated-fonts/${latin}")`);
    }

    const withChunk = (chunkRel, range) =>
      block
        .replace(urls[0][0], `url("~generated-fonts/${chunkRel}")`)
        .replace(/\}$/, `  unicode-range: ${range};\n}`);

    return (
      withChunk(latin, LATIN_UNICODE_RANGE) +
      "\n\n" +
      withChunk(rest, REST_UNICODE_RANGE)
    );
  }

  async chunksFor(rel, subsetFont) {
    const buf = fs.readFileSync(path.join(this.fontsDir, rel));
    // A face may ship a wider companion under `full/`, covering scripts the web
    // file omits. Lato does: the shipped file is a lean latin subset, so without
    // this the default font cannot render Cyrillic at all. The latin chunk still
    // comes from the lean file, so the critical path is unchanged, and the wider
    // glyphs only arrive when a page needs them.
    const fullPath = path.join(
      this.fontsDir,
      path.dirname(rel),
      "full",
      `${path.basename(rel, ".woff2")}.ttf`,
    );
    const restBuf = fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : buf;
    const key = crypto
      .createHash("sha1")
      .update(buf)
      .update(restBuf)
      .digest("hex")
      .slice(0, 12);
    const dir = path.dirname(rel);
    fs.mkdirSync(path.join(this.outputDir, dir), { recursive: true });

    const base = path.basename(rel, ".woff2");
    const made = {};
    for (const [name, characters] of [
      ["latin", latinCharacters()],
      ["rest", restCharacters()],
    ]) {
      const chunkRel = path.join(dir, `${base}.${key}.${name}.woff2`);
      const chunkPath = path.join(this.outputDir, chunkRel);
      if (!fs.existsSync(chunkPath)) {
        const from = name === "rest" ? restBuf : buf;
        const subset = await subsetFont(from, characters, {
          targetFormat: "woff2",
        });
        if (name === "rest" && subset.length < MIN_USEFUL_CHUNK_BYTES) {
          made.rest = undefined;
          continue;
        }
        writeAtomic(chunkPath, subset);
      }
      made[name] = chunkRel;
    }
    return made;
  }
}

/**
 * Both compilers run in parallel and generate the same chunks, so writes go to a
 * unique temporary name and are renamed into place. A reader then sees either
 * the old file or the complete new one, never a half-written font.
 */
function writeAtomic(target, contents) {
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, target);
}

module.exports = { FontSubsetPlugin };
