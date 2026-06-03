import { splitMarkdownBlocks } from "./splitMarkdownBlocks";

describe("splitMarkdownBlocks", () => {
  it("returns no blocks for empty input", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
  });

  it("keeps a single paragraph as one block", () => {
    expect(splitMarkdownBlocks("just one line")).toEqual(["just one line"]);
  });

  it("splits paragraphs separated by a blank line", () => {
    const blocks = splitMarkdownBlocks("para one\n\npara two");
    expect(blocks).toHaveLength(2);
    expect(blocks.join("")).toBe("para one\n\npara two");
  });

  it("does not split inside a fenced code block", () => {
    const md = "intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nafter";
    const blocks = splitMarkdownBlocks(md);
    expect(blocks.some((b) => b.includes("```js"))).toBe(true);
    // the blank line inside the fence must not have started a new block
    const fenceBlock = blocks.find((b) => b.includes("```js"));
    expect(fenceBlock).toContain("const b = 2;");
  });

  it("round-trips: joining the blocks reproduces the input", () => {
    const md =
      "# Heading\n\nPara with **bold**\n\n- a\n- b\n\n```\ncode\n```\n";
    expect(splitMarkdownBlocks(md).join("")).toBe(md);
  });
});
