// Writes .gz and .br siblings for every file given on the command line.
//
// The locale catalogues are produced by the Clojure build rather than by rspack,
// so they miss `frontend/build/shared/rspack/compression.js`. This applies the
// same two compressors at the same settings, so a catalogue is served the way
// every other static asset is.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { constants, brotliCompressSync, gzipSync } from "node:zlib";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("usage: node bin/compress-assets.mjs <file> [file...]");
  process.exit(1);
}

for (const file of files) {
  const contents = readFileSync(file);

  writeFileSync(`${file}.gz`, gzipSync(contents, { level: constants.Z_MAX_LEVEL }));
  writeFileSync(
    `${file}.br`,
    brotliCompressSync(contents, {
      params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
    }),
  );

  console.log(`compressed ${basename(file)}`);
}
