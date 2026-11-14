import { Lexer } from "marked";

import { splitMarkdownBlocks } from "./splitMarkdownBlocks";

describe("splitMarkdownBlocks", () => {
  it("should return the whole source as one block before the lexer has loaded", () => {
    expect(splitMarkdownBlocks("a\n\nb")).toEqual(["a\n\nb"]);
  });

  it("should return no blocks for an empty source", () => {
    expect(splitMarkdownBlocks("", Lexer)).toEqual([]);
  });

  it("should split top-level blocks without losing any source", () => {
    const source =
      "# Title\n\npara one\n\n- a\n- b\n\n| h |\n| - |\n| 1 |\n\n```sql\nSELECT 1\n```\n\nlast";
    const blocks = splitMarkdownBlocks(source, Lexer);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.join("")).toBe(source);
  });

  it("should not emit empty blocks for blank lines", () => {
    const blocks = splitMarkdownBlocks("a\n\n\n\nb", Lexer);
    expect(blocks.every((block) => block.trim() !== "")).toBe(true);
  });

  it("should keep completed blocks stable as the source grows", () => {
    const full = "para one\n\npara two\n\npara three";
    const finalBlocks = splitMarkdownBlocks(full, Lexer);

    for (let length = 1; length <= full.length; length++) {
      const blocks = splitMarkdownBlocks(full.slice(0, length), Lexer);
      const completed = blocks.slice(0, -1);

      completed.forEach((block, index) => {
        expect(block).toBe(finalBlocks[index]);
      });
    }
  });

  it("should degrade to a single block for link reference definitions", () => {
    const source = "See [x] here.\n\n[x]: https://example.com\n";
    expect(splitMarkdownBlocks(source, Lexer)).toEqual([source]);
  });

  it("should degrade to a single block for footnotes", () => {
    const source = "Text[^1]\n\n[^1]: note\n";
    expect(splitMarkdownBlocks(source, Lexer)).toEqual([source]);
  });

  it("should treat an unterminated fence as one block", () => {
    const blocks = splitMarkdownBlocks("intro\n\n```sql\nSELECT 1", Lexer);
    expect(blocks[blocks.length - 1]).toContain("```sql");
  });
});
