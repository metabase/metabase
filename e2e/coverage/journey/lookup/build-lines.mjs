// Writes lines.json and classes.json into an index: each backend class's source file and line range,
// read from the class files of the run's uberjar (the journey-capture-uberjar artifact).
//   node build-lines.mjs --jar <metabase.jar> --index <index dir>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseArgs } from "./args.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.jar || !args.index) {
  console.error(
    "Usage: node build-lines.mjs --jar <metabase.jar> --index <index dir>",
  );
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(args.tmp ?? os.tmpdir(), "classes-"));
execFileSync(
  "unzip",
  ["-q", "-o", args.jar, "metabase/*", "metabase_enterprise/*", "-d", tmp],
  {
    stdio: "inherit",
  },
);

function parseClass(buf) {
  let at = 8;
  const u1 = () => buf[at++];
  const u2 = () => {
    const v = buf.readUInt16BE(at);
    at += 2;
    return v;
  };
  const u4 = () => {
    const v = buf.readUInt32BE(at);
    at += 4;
    return v;
  };
  const count = u2();
  const utf8 = new Array(count);
  for (let i = 1; i < count; i++) {
    const tag = u1();
    switch (tag) {
      case 1: {
        const len = u2();
        utf8[i] = buf.toString("utf8", at, at + len);
        at += len;
        break;
      }
      case 5:
      case 6:
        at += 8;
        i++;
        break;
      case 3:
      case 4:
      case 9:
      case 10:
      case 11:
      case 12:
      case 17:
      case 18:
        at += 4;
        break;
      case 15:
        at += 3;
        break;
      case 7:
      case 8:
      case 16:
      case 19:
      case 20:
        at += 2;
        break;
      default:
        throw new Error(`constant pool tag ${tag}`);
    }
  }
  at += 6;
  const interfaces = u2();
  at += 2 * interfaces;
  let min = Infinity;
  let max = -Infinity;
  let sourceFile = null;
  const skipAttributes = (onAttribute) => {
    const n = u2();
    for (let i = 0; i < n; i++) {
      const name = utf8[u2()];
      const len = u4();
      const end = at + len;
      onAttribute?.(name);
      at = end;
    }
  };
  const members = (withCode) => {
    const n = u2();
    for (let i = 0; i < n; i++) {
      at += 6;
      skipAttributes(
        withCode
          ? (name) => {
              if (name !== "Code") {
                return;
              }
              at += 4;
              const codeLength = u4();
              at += codeLength;
              const exceptions = u2();
              at += 8 * exceptions;
              skipAttributes((inner) => {
                if (inner !== "LineNumberTable") {
                  return;
                }
                const entries = u2();
                for (let e = 0; e < entries; e++) {
                  at += 2;
                  const line = u2();
                  min = Math.min(min, line);
                  max = Math.max(max, line);
                }
              });
            }
          : null,
      );
    }
  };
  members(false);
  members(true);
  skipAttributes((name) => {
    if (name === "SourceFile") {
      sourceFile = utf8[u2()];
    }
  });
  return {
    sourceFile,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
  };
}

const lines = {};
let failed = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".class")) {
      const name = path.relative(tmp, full).slice(0, -".class".length);
      try {
        const { sourceFile, min, max } = parseClass(fs.readFileSync(full));
        lines[name] = [sourceFile, min, max];
      } catch {
        failed += 1;
      }
    }
  }
}
walk(tmp);
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(path.join(args.index, "lines.json"), JSON.stringify(lines));
fs.writeFileSync(
  path.join(args.index, "classes.json"),
  JSON.stringify(Object.keys(lines).sort()),
);
console.error(`${Object.keys(lines).length} classes, ${failed} unreadable`);
