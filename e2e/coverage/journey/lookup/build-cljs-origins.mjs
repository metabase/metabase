// Writes cljs-origins.json into an index: for each function in the browser copy of the cljs code,
// the cljc/cljs source line it came from, read from the journey-capture-cljs artifact's source maps.
//   node build-cljs-origins.mjs --maps <journey-capture-cljs dir> --index <index dir>
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "./args.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.maps || !args.index) {
  console.error(
    "Usage: node build-cljs-origins.mjs --maps <dir> --index <index dir>",
  );
  process.exit(1);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_VALUE = new Map([...B64].map((ch, i) => [ch, i]));

function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64_VALUE.get(ch);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/** Mapping segments per generated line (1-based), each [generated column, source, original line (1-based)]. */
function decodeMap(json) {
  const byLine = new Map();
  const sections = json.sections ?? [
    { offset: { line: 0, column: 0 }, map: json },
  ];
  for (const { offset, map } of sections) {
    let source = 0;
    let origLine = 0;
    map.mappings.split(";").forEach((lineText, lineIndex) => {
      let genCol = lineIndex === 0 ? offset.column : 0;
      const genLine = offset.line + lineIndex + 1;
      if (!lineText) {
        return;
      }
      const list = byLine.get(genLine) ?? [];
      for (const segment of lineText.split(",")) {
        const v = decodeVlq(segment);
        genCol += v[0];
        if (v.length >= 4) {
          source += v[1];
          origLine += v[2];
          list.push([genCol, map.sources[source], origLine + 1]);
        }
      }
      byLine.set(genLine, list);
    });
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a[0] - b[0]);
  }
  return byLine;
}

const fnmap = JSON.parse(
  fs.readFileSync(path.join(args.index, "fnmap.json"), "utf8"),
);
const origins = {};
let mapped = 0;
let total = 0;
for (const [file, fns] of Object.entries(fnmap)) {
  if (!file.startsWith("target/cljs_release/")) {
    continue;
  }
  const mapFile = path.join(args.maps, `${path.basename(file)}.map`);
  if (!fs.existsSync(mapFile)) {
    continue;
  }
  const byLine = decodeMap(JSON.parse(fs.readFileSync(mapFile, "utf8")));
  for (const [fnIndex, fn] of Object.entries(fns)) {
    total += 1;
    const list = byLine.get(fn.line) ?? [];
    // The function keyword itself rarely has a mapping, so take the first mapped position from its start.
    const at =
      list.find(([col]) => col >= fn.column) ??
      list.filter(([col]) => col <= fn.column).at(-1);
    if (at && at[1]) {
      origins[`${file}#${fnIndex}`] = [at[1], at[2]];
      mapped += 1;
    }
  }
}
fs.writeFileSync(
  path.join(args.index, "cljs-origins.json"),
  JSON.stringify(origins),
);
console.error(`${mapped} of ${total} cljs functions mapped to source`);
