const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  LATIN_UNICODE_RANGE,
  REST_UNICODE_RANGE,
  buildFontFaces,
  latinCharacters,
  restCharacters,
} = require("../fonts");

// A face with nothing outside latin still subsets to a small valid font. Below
// this it carries no real glyphs and declaring it would only add a request that
// renders nothing.
const MIN_USEFUL_CHUNK_BYTES = 3000;

const SUBSET_OPTIONS = { targetFormat: "woff2" };

// Chunks are cached under the hash of their source, so everything else that
// decides their contents belongs in that hash. Without this, editing a range
// leaves every warm tree serving the chunks built from the old one.
const RECIPE = JSON.stringify([
  LATIN_UNICODE_RANGE,
  REST_UNICODE_RANGE,
  SUBSET_OPTIONS,
]);

/**
 * Builds the bundled `@font-face` rules from the fonts themselves, then splits
 * each face into a latin chunk and a chunk holding everything else, declared
 * with a `unicode-range`. A page downloads only the chunks it renders, and
 * coverage is unchanged because the browser fetches the second chunk on demand.
 *
 * The whole stylesheet is this loader's return value. Its resource is a virtual
 * module, so there is no file to drift from the fonts it describes. Subsetting a
 * face costs around 100ms, so the chunks are cached on disk under the hash of
 * their source: a cold build pays about eighteen seconds, later builds nothing.
 */
module.exports = function fontSubsetLoader() {
  const callback = this.async();
  rewrite(this).then((rewritten) => callback(null, rewritten), callback);
};

async function rewrite(loader) {
  const { fontsDir, outputDir } = loader.getOptions();
  const subsetFont = (await import("subset-font")).default;
  fs.mkdirSync(outputDir, { recursive: true });
  // Nothing about this module comes from its own resource, so everything it is
  // built from has to invalidate it explicitly. `buildFontFaces` reports each
  // font it reads.
  loader.addDependency(require.resolve("../fonts"));
  const css = await buildFontFaces(fontsDir, (file) =>
    loader.addDependency(file),
  );

  const chunksFor = async (rel) => {
    const source = path.join(fontsDir, rel);
    // A face may ship a wider companion under `full/`, covering scripts the web
    // file omits. Lato does: the shipped file is a lean latin subset, so without
    // this the default font cannot render Cyrillic at all. The latin chunk still
    // comes from the lean file, so the critical path is unchanged, and the wider
    // glyphs only arrive when a page needs them.
    const full = path.join(
      fontsDir,
      path.dirname(rel),
      "full",
      `${path.basename(rel, ".woff2")}.ttf`,
    );
    const hasFull = fs.existsSync(full);
    loader.addDependency(source);
    if (hasFull) {
      loader.addDependency(full);
    }

    const buf = fs.readFileSync(source);
    const restBuf = hasFull ? fs.readFileSync(full) : buf;
    const key = crypto
      .createHash("sha1")
      .update(buf)
      .update(restBuf)
      .update(RECIPE)
      .digest("hex")
      .slice(0, 12);

    const dir = path.dirname(rel);
    fs.mkdirSync(path.join(outputDir, dir), { recursive: true });

    const base = path.basename(rel, ".woff2");
    const made = {};
    for (const [name, characters] of [
      ["latin", latinCharacters()],
      ["rest", restCharacters()],
    ]) {
      const chunkRel = path.join(dir, `${base}.${key}.${name}.woff2`);
      const chunkPath = path.join(outputDir, chunkRel);
      if (!fs.existsSync(chunkPath)) {
        const from = name === "rest" ? restBuf : buf;
        const subset = await subsetFont(from, characters, SUBSET_OPTIONS);
        if (name === "rest" && subset.length < MIN_USEFUL_CHUNK_BYTES) {
          made.rest = undefined;
          continue;
        }
        writeAtomic(chunkPath, subset);
      }
      made[name] = chunkRel;
    }
    return made;
  };

  const splitFace = async (block) => {
    const urls = [...block.matchAll(/url\("~fonts\/([^"]+\.woff2)"\)/g)];
    // Faces that are not a single woff2, such as the legacy Lato fallbacks with
    // their eot and svg sources, are passed through untouched.
    if (urls.length !== 1) {
      return block;
    }
    const rel = urls[0][1];
    if (!fs.existsSync(path.join(fontsDir, rel))) {
      return block;
    }

    const { latin, rest } = await chunksFor(rel);
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
  };

  const out = [];
  let cursor = 0;
  let block;
  const blockRe = /@font-face \{[^}]*\}/g;
  while ((block = blockRe.exec(css)) !== null) {
    out.push(css.slice(cursor, block.index));
    cursor = block.index + block[0].length;
    out.push(await splitFace(block[0]));
  }
  out.push(css.slice(cursor));
  return out.join("");
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
