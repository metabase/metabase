import fs from "fs";
import path from "path";

import {
  SUBSET_OPTIONS,
  buildFontFaces,
  latinCharacters,
  restCharacters,
  subsetFace,
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

describe("subsetting", () => {
  // The subsetter drops the `.notdef` outline unless asked, and `.notdef` is
  // the box a browser draws for a character no font in the stack can render.
  // Dropping it turns a missing glyph into blank space, so the text loses it
  // with nothing to show for it. Keeping it costs a few hundred bytes a face.
  it("keeps the box a browser draws for a character no font has", async () => {
    const source = fs.readFileSync(
      path.join(FONTS_DIR, DEFAULT_FAMILY, "lato-v16-latin-regular.woff2"),
    );
    const kept = await subsetFace(source, "abc");
    const dropped = await subsetFace(source, "abc", {
      ...SUBSET_OPTIONS,
      notdefOutline: false,
    });
    expect(kept.length).toBeGreaterThan(dropped.length);
  });

  // Lato is drawn from two upstream releases: the latin it has always shipped,
  // and the scripts merged in from the later one, which re-spaced the family.
  // The merge takes only codepoints the first chunk does not serve, so a latin
  // page renders exactly what it did. If a script glyph reached the first
  // chunk it would arrive with the later release's spacing.
  it("keeps the scripts merged into the default family out of its latin chunk", async () => {
    const source = fs.readFileSync(
      path.join(FONTS_DIR, DEFAULT_FAMILY, "lato-v16-latin-regular.woff2"),
    );
    const cyrillicAndGreek = /[\u0370-\u03ff\u0400-\u052f]/;
    expect(cyrillicAndGreek.test(restCharacters())).toBe(true);
    expect(cyrillicAndGreek.test(latinCharacters())).toBe(false);

    const latin = await subsetFace(source, latinCharacters());
    const rest = await subsetFace(source, restCharacters());
    expect(rest.length).toBeGreaterThan(latin.length / 2);
  });
});
