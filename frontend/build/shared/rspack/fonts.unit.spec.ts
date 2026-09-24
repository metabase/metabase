import fs from "fs";
import path from "path";

import {
  LATIN_UNICODE_RANGE,
  REST_UNICODE_RANGE,
  buildFontFaces,
} from "./fonts";

const FONTS_DIR = path.join(__dirname, "../../../fonts");
const DEFAULT_FAMILY = "Lato";

interface Face {
  family: string;
  weight: string;
  display: string | null;
  locals: string[];
  urls: string[];
}

const parse = (css: string): Face[] =>
  [...css.matchAll(/@font-face \{[^}]*\}/g)].map(([block]) => ({
    family: /font-family:\s*([^;]+);/.exec(block)![1].replace(/^"|"$/g, ""),
    weight: /font-weight:\s*([^;]+);/.exec(block)![1],
    display: /font-display:\s*(\w+)/.exec(block)?.[1] ?? null,
    locals: [...block.matchAll(/local\("([^"]+)"\)/g)].map(([, name]) => name),
    urls: [...block.matchAll(/url\("~fonts\/([^"#?]+)/g)].map(([, url]) => url),
  }));

const familyDirectories = fs
  .readdirSync(FONTS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("buildFontFaces", () => {
  let faces: Face[];
  let read: string[];

  beforeAll(async () => {
    read = [];
    faces = parse(
      await buildFontFaces(FONTS_DIR, (file: string) => read.push(file)),
    );
  });

  it("declares every bundled family", () => {
    expect(new Set(faces.map((face) => face.family))).toEqual(
      new Set(familyDirectories.map((name) => name.replace(/_/g, " "))),
    );
  });

  it("declares one face per shipped woff2", () => {
    const shipped = familyDirectories.flatMap((directory) =>
      fs
        .readdirSync(path.join(FONTS_DIR, directory))
        .filter((file) => file.endsWith(".woff2")),
    );
    expect(faces).toHaveLength(shipped.length);
  });

  it("gives every face a weight the fonts are actually drawn at", () => {
    expect(new Set(faces.map((face) => face.weight))).toEqual(
      new Set(["400", "700", "900"]),
    );
  });

  // A local() that matches nothing fails silently, and only on a machine with
  // that font installed, so no rendering test can catch it. These come from the
  // font's own name table, which is what a browser matches against.
  it("names each face the way an installed copy is named", () => {
    const squashed = (name: string) => name.replace(/[\s-]/g, "");
    for (const face of faces) {
      expect(face.locals.length).toBeGreaterThan(0);
      for (const local of face.locals) {
        expect(squashed(local).startsWith(squashed(face.family))).toBe(true);
      }
    }
  });

  it("reads the names out of the font rather than the filename", async () => {
    const jetBrains = faces.find(
      (face) => face.family === "JetBrains Mono" && face.weight === "400",
    );
    expect(jetBrains?.locals).toEqual([
      "JetBrains Mono Regular",
      "JetBrainsMono-Regular",
    ]);
  });

  it("points every source at a file that exists", () => {
    for (const face of faces) {
      expect(face.urls.length).toBeGreaterThan(0);
      for (const url of face.urls) {
        expect(fs.existsSync(path.join(FONTS_DIR, url))).toBe(true);
      }
    }
  });

  // The default font is on the critical path of every page, so swapping it
  // would flash a fallback on each load.
  it("swaps every family but the default", () => {
    for (const face of faces) {
      expect(face.display).toBe(face.family === DEFAULT_FAMILY ? null : "swap");
    }
  });

  it("reports every font it read, so the build can watch them", () => {
    expect(read).toHaveLength(faces.length);
    expect(read.every((file) => fs.existsSync(file))).toBe(true);
  });
});

describe("unicode-range descriptors", () => {
  // CSS writes `U+` once at the start of a range: `U+20-FF`, never `U+20-U+FF`.
  // A browser drops a descriptor it cannot parse, and the face then matches
  // every codepoint, so every page fetches every chunk of the family it uses.
  const SINGLE_OR_RANGE = /^U\+[0-9A-F]{1,6}(-[0-9A-F]{1,6})?$/;

  it.each([
    ["latin", LATIN_UNICODE_RANGE],
    ["rest", REST_UNICODE_RANGE],
  ])("writes %s as CSS can parse it", (_name, range) => {
    const tokens = range.split(", ");
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token).toMatch(SINGLE_OR_RANGE);
    }
  });

  it.each([
    ["latin", LATIN_UNICODE_RANGE],
    ["rest", REST_UNICODE_RANGE],
  ])("never repeats U+ inside a %s range", (_name, range) => {
    expect(range).not.toMatch(/-U\+/);
  });
});
