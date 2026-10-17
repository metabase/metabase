// The swc transform that jest's config gives jest, with a cache on disk and
// source maps for the line numbers of failures.
import crypto from "node:crypto";
import fs from "node:fs";
import { SourceMap } from "node:module";
import path from "node:path";

import { transformSync } from "@swc/core";

import { root } from "../jest-config.ts";
import type { SourceFrame } from "../types.ts";

import { isProjectSource } from "./project.ts";

export const cacheDirectory = path.join(
  root,
  "node_modules/.cache/test-harness",
);

// The cache is keyed on content, not on modification time, so it survives a
// fresh checkout. Bump this whenever the transform options change.
const TRANSFORM_VERSION = "2";
const MAX_PROJECT_FRAMES = 5;
// What @swc/jest sets. `hidden.jest` hoists jest.mock calls above the imports,
// and swc's published types do not know it.
const JEST_TRANSFORM_OPTIONS = {
  react: { runtime: "automatic" },
  hidden: { jest: true },
} as const;

// A file cannot change within one process. Every spec file evaluates the
// project's modules again, and would otherwise read and hash every source
// again each time.
const transformedCode = new Map<string, string>();
const sourceMapFiles = new Map<string, string>();
const sourceMaps = new Map<string, SourceMap | null>();

export function transform(file: string): string {
  let code = transformedCode.get(file);
  if (code === undefined) {
    code = transformWithCache(file, fs.readFileSync(file, "utf8"));
    transformedCode.set(file, code);
  }
  return code;
}

/**
 * The frames of a stack that are in the project's own code, innermost first,
 * at their positions in the files as written.
 */
export function projectFrames(stack: string | undefined): SourceFrame[] {
  const frames: SourceFrame[] = [];
  for (const line of String(stack).split("\n")) {
    const match = line.match(/\(?((?:\/|[A-Za-z]:\\)[^():]+):(\d+):(\d+)\)?$/);
    if (!match || !isProjectSource(match[1])) {
      continue;
    }
    const [, file, lineNumber, column] = match;
    frames.push({
      file: path.relative(root, file),
      ...originalPosition(file, Number(lineNumber), Number(column)),
    });
    if (frames.length === MAX_PROJECT_FRAMES) {
      break;
    }
  }
  return frames;
}

function transformWithCache(file: string, source: string): string {
  const key = crypto
    .createHash("sha1")
    .update(TRANSFORM_VERSION)
    .update("\0")
    .update(file)
    .update("\0")
    .update(source)
    .digest("hex");
  const cached = path.join(cacheDirectory, `${key}.js`);
  // The map is read only when a failure needs a line number, so it costs a
  // passing run nothing.
  sourceMapFiles.set(file, `${cached}.map`);
  if (fs.existsSync(cached)) {
    return fs.readFileSync(cached, "utf8");
  }

  const { code, map = "" } = transformSync(source, {
    filename: file,
    sourceMaps: true,
    jsc: {
      target: "es2022",
      loose: true,
      parser: /\.tsx?$/.test(file)
        ? { syntax: "typescript", tsx: file.endsWith(".tsx") }
        : { syntax: "ecmascript", jsx: true },
      transform: JEST_TRANSFORM_OPTIONS,
      experimental: {
        plugins: [
          ["@swc-contrib/mut-cjs-exports", {}],
          ["@swc/plugin-emotion", { sourceMap: false }],
        ],
      },
    },
    module: { type: "commonjs", lazy: true },
  });

  // Several workers share the cache, so the code is written under a name of
  // this process's own and then renamed into place.
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const temporary = `${cached}.${process.pid}.tmp`;
  fs.writeFileSync(`${cached}.map`, map);
  fs.writeFileSync(temporary, code);
  fs.renameSync(temporary, cached);
  return code;
}

function originalPosition(
  file: string,
  line: number,
  column: number,
): Omit<SourceFrame, "file"> {
  if (!sourceMaps.has(file)) {
    sourceMaps.set(file, readSourceMap(file));
  }
  const entry = sourceMaps.get(file)?.findEntry(line - 1, column - 1);
  if (!entry || !("originalLine" in entry)) {
    return { line, column };
  }
  return { line: entry.originalLine + 1, column: entry.originalColumn + 1 };
}

function readSourceMap(file: string): SourceMap | null {
  const mapFile = sourceMapFiles.get(file);
  if (!mapFile) {
    return null;
  }
  try {
    return new SourceMap(JSON.parse(fs.readFileSync(mapFile, "utf8")));
  } catch {
    // A map that is missing or half written only costs the line numbers.
    return null;
  }
}
