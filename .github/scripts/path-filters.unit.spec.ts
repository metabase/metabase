import { readFileSync } from "node:fs";

import {
  type ChangedFile,
  matchFilters,
  parseFilters,
} from "./path-filters";

const modified = (filename: string): ChangedFile => ({
  filename,
  status: "modified",
});

describe("parseFilters", () => {
  it("reads a plain list of globs", () => {
    expect(parseFilters("docs:\n  - 'docs/**'\n  - '**/*.md'\n")).toEqual({
      docs: [
        { glob: "docs/**", statuses: null },
        { glob: "**/*.md", statuses: null },
      ],
    });
  });

  it("flattens the nested lists that anchors expand into", () => {
    const yaml = `
shared: &shared
  - "src/**"
outer: &outer
  - *shared
  - "lib/**"
nested:
  - *outer
  - "app/**"
`;
    expect(parseFilters(yaml).nested.map((rule) => rule.glob)).toEqual([
      "src/**",
      "lib/**",
      "app/**",
    ]);
  });

  it("reads change-type maps", () => {
    expect(parseFilters(`lint:\n  - added|modified: "*.yml"\n`)).toEqual({
      lint: [{ glob: "*.yml", statuses: ["added", "modified"] }],
    });
  });

  it("reads a change-type map holding several globs", () => {
    const parsed = parseFilters(`lint:\n  - added: ["a.yml", "b.yml"]\n`);
    expect(parsed.lint).toEqual([
      { glob: "a.yml", statuses: ["added"] },
      { glob: "b.yml", statuses: ["added"] },
    ]);
  });

  it("accepts a bare string instead of a list", () => {
    expect(parseFilters(`docs: "docs/**"\n`).docs).toEqual([
      { glob: "docs/**", statuses: null },
    ]);
  });

  it("accepts every change type dorny does", () => {
    const yaml = `all:\n  - added|copied|deleted|modified|renamed|unmerged: "*"\n`;
    expect(parseFilters(yaml).all[0].statuses).toEqual([
      "added",
      "copied",
      "deleted",
      "modified",
      "renamed",
      "unmerged",
    ]);
  });

  // `unknown` is the internal fallback for a git letter or API status we do not
  // model. A filter file naming it would be asking for something dorny has no
  // concept of, so it is rejected like any other typo.
  it("rejects the internal unknown status", () => {
    expect(() => parseFilters(`lint:\n  - unknown: "*.yml"\n`)).toThrow();
  });

  it.each([
    ["an unknown change type", `lint:\n  - creted: "*.yml"\n`],
    ["a non-string glob", `lint:\n  - added: 42\n`],
    ["a non-string entry", `lint:\n  - 42\n`],
    ["a top-level list", `- "docs/**"\n`],
  ])("rejects %s", (_label, yaml) => {
    expect(() => parseFilters(yaml)).toThrow();
  });

  it("parses the real filter file", () => {
    const filters = parseFilters(
      readFileSync(".github/file-paths.yaml", "utf8"),
    );

    expect(Object.keys(filters).length).toBeGreaterThan(0);
    expect(filters.actionlint).toEqual([
      { glob: ".github/workflows/*.yml", statuses: ["added", "modified"] },
      { glob: ".github/workflows/*.yaml", statuses: ["added", "modified"] },
    ]);
    // Expanded through three levels of anchors.
    expect(filters.frontend_all.map((rule) => rule.glob)).toContain("src/**/*.cljc");
  });
});

describe("matchFilters", () => {
  const filters = parseFilters(`
backend:
  - "src/**"
  - "resources/**"
docs:
  - "docs/**"
lint:
  - added|modified: "*.yml"
everything:
  - "**"
`);

  const match = (files: ChangedFile[]) =>
    matchFilters(filters, { kind: "files", files });

  it("matches a file against any one of a filter's globs", () => {
    const result = match([modified("resources/x.edn")]);
    expect(result.matched).toEqual(["backend", "everything"]);
  });

  it("reports every declared filter, including the ones that did not fire", () => {
    const result = match([modified("docs/x.md")]);
    if (result.kind !== "files") {
      throw new Error("expected a file-backed result");
    }
    expect(Object.keys(result.files).sort()).toEqual([
      "backend",
      "docs",
      "everything",
      "lint",
    ]);
    expect(result.files.backend).toEqual([]);
  });

  it("matches dotfiles, which picomatch skips unless dot is set", () => {
    expect(match([modified(".env")]).matched).toContain("everything");
  });

  it("honours change types", () => {
    expect(match([{ filename: "a.yml", status: "added" }]).matched).toContain(
      "lint",
    );
    expect(
      match([{ filename: "a.yml", status: "deleted" }]).matched,
    ).not.toContain("lint");
  });

  it("collects the matching files per filter", () => {
    const result = match([modified("src/a.clj"), modified("docs/b.md")]);
    if (result.kind !== "files") {
      throw new Error("expected a file-backed result");
    }
    expect(result.files.backend.map((file) => file.filename)).toEqual([
      "src/a.clj",
    ]);
  });

  it("matches nothing when nothing changed", () => {
    expect(match([]).matched).toEqual([]);
  });

  describe("when the diff could not be established", () => {
    const result = matchFilters(filters, {
      kind: "all",
      reason: "no merge-base",
    });

    it("matches every filter so no suite is skipped", () => {
      expect(result.matched).toEqual([
        "backend",
        "docs",
        "lint",
        "everything",
      ]);
    });

    it("carries the reason and offers no file lists to narrow from", () => {
      expect(result).toMatchObject({ kind: "all", reason: "no merge-base" });
      expect(result).not.toHaveProperty("files");
    });
  });
});
