const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  LATIN_UNICODE_RANGE,
  REST_UNICODE_RANGE,
  SUBSET_OPTIONS,
  buildFontFaces,
  latinCharacters,
  restCharacters,
  subsetFace,
} = require("../fonts");

// Chunks are cached under the hash of their source, so everything else that
// decides their contents belongs in that hash too. The subsetter goes in as the
// file on disk, which is what tells a patched copy from an unpatched one.
const RECIPE = crypto
  .createHash("sha1")
  .update(
    JSON.stringify([LATIN_UNICODE_RANGE, REST_UNICODE_RANGE, SUBSET_OPTIONS]),
  )
  .update(fs.readFileSync(require.resolve("subset-font")))
  .digest("hex");

/**
 * Builds the bundled `@font-face` rules, then splits each face into a latin
 * chunk and a chunk holding everything else, declared with a `unicode-range`.
 * Coverage is unchanged: the browser fetches the second chunk on demand.
 *
 * The whole stylesheet is this loader's return value, and its resource is a
 * virtual module. Subsetting a face costs around 100ms, so chunks are cached on
 * disk: a cold build pays about eighteen seconds, later builds nothing.
 */
module.exports = function fontSubsetLoader() {
  const callback = this.async();
  rewrite(this).then((rewritten) => callback(null, rewritten), callback);
};

async function rewrite(loader) {
  const { fontsDir, outputDir, unicodeRangesAsset } = loader.getOptions();
  fs.mkdirSync(outputDir, { recursive: true });
  // A rule written outside this stylesheet has to declare every chunk of a face
  // with its range. The keys are the chunk names in the emitted filenames.
  if (unicodeRangesAsset) {
    loader.emitFile(
      unicodeRangesAsset,
      JSON.stringify({
        latin: LATIN_UNICODE_RANGE,
        rest: REST_UNICODE_RANGE,
      }),
    );
  }
  // Nothing here comes from the module's own resource, so everything it is
  // built from has to invalidate it explicitly.
  loader.addDependency(require.resolve("../fonts"));
  loader.addContextDependency(fontsDir);
  const css = await buildFontFaces(fontsDir, (file) =>
    loader.addDependency(file),
  );

  const chunksFor = async (rel) => {
    const source = path.join(fontsDir, rel);
    loader.addDependency(source);
    const buf = fs.readFileSync(source);
    const key = crypto
      .createHash("sha1")
      .update(buf)
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
        writeAtomic(chunkPath, await subsetFace(buf, characters));
      }
      made[name] = chunkRel;
    }
    return made;
  };

  const splitFace = async (block) => {
    const urls = [...block.matchAll(/url\("~fonts\/([^"]+\.woff2)"\)/g)];
    // Only the woff2 of a face is split. Its other formats stay whole in both
    // rules, for a browser that cannot read woff2.
    if (urls.length !== 1) {
      return block;
    }
    const rel = urls[0][1];
    if (!fs.existsSync(path.join(fontsDir, rel))) {
      return block;
    }

    const { latin, rest } = await chunksFor(rel);

    const withChunk = (face, chunkRel, range) =>
      face
        .replace(urls[0][0], `url("~generated-fonts/${chunkRel}")`)
        .replace(/\}$/, `  unicode-range: ${range};\n}`);

    return (
      withChunk(block, latin, LATIN_UNICODE_RANGE) +
      "\n\n" +
      withChunk(swapped(block), rest, REST_UNICODE_RANGE)
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
 * The second chunk is never on the critical path, so it always swaps. Without
 * this the default family would hide the characters in it while it downloads,
 * where the system font used to draw them at once.
 */
function swapped(face) {
  return face.includes("font-display:")
    ? face
    : face.replace(/\}$/, "  font-display: swap;\n}");
}

/**
 * Both compilers generate the same chunks in parallel, so a reader must see
 * either the old file or the complete new one, never a half-written font.
 */
function writeAtomic(target, contents) {
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, target);
}
