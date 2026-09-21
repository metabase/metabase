import { splitMarkdownBlocks } from "./splitMarkdownBlocks";

describe("splitMarkdownBlocks", () => {
  it("should return no blocks for an empty source", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
  });

  it("should split top-level blocks without losing any source", () => {
    const source =
      "# Title\n\npara one\n\n- a\n- b\n\n| h |\n| - |\n| 1 |\n\n```sql\nSELECT 1\n```\n\nlast";
    const blocks = splitMarkdownBlocks(source);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.join("")).toBe(source);
  });

  it("should not emit empty blocks for blank lines", () => {
    const blocks = splitMarkdownBlocks("a\n\n\n\nb");
    expect(blocks.every((block) => block.trim() !== "")).toBe(true);
  });

  it("should keep completed blocks stable as the source grows", () => {
    const full = "para one\n\npara two\n\npara three";
    const finalBlocks = splitMarkdownBlocks(full);

    for (let length = 1; length <= full.length; length++) {
      const blocks = splitMarkdownBlocks(full.slice(0, length));
      const completed = blocks.slice(0, -1);

      completed.forEach((block, index) => {
        expect(block).toBe(finalBlocks[index]);
      });
    }
  });

  it("should degrade to a single block for link reference definitions", () => {
    const source = "See [x] here.\n\n[x]: https://example.com\n";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("should degrade to a single block for footnotes", () => {
    const source = "Text[^1]\n\n[^1]: note\n";
    expect(splitMarkdownBlocks(source)).toEqual([source]);
  });

  it("should treat an unterminated fence as one block", () => {
    const blocks = splitMarkdownBlocks("intro\n\n```sql\nSELECT 1");
    expect(blocks[blocks.length - 1]).toContain("```sql");
  });
});
