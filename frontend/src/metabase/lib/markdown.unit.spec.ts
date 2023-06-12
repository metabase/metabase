import { parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("handles an empty input", () => {
    expect(parseMarkdown("")).toMatchObject({
      children: [],
    });
  });

  it("renders a single heading", () => {
    expect(parseMarkdown("# Lorem ipsum")).toMatchObject({
      children: [
        {
          tagName: "h1",
          children: [{ type: "text", value: "Lorem ipsum" }],
        },
      ],
    });
  });

  it("renders a single paragraph", () => {
    expect(parseMarkdown("Lorem ipsum")).toMatchObject({
      children: [
        {
          tagName: "p",
          children: [{ type: "text", value: "Lorem ipsum" }],
        },
      ],
    });
  });

  it("renders a mix of heading and paragraph", () => {
    const root = parseMarkdown(["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n"));

    expect(root.children).toHaveLength(3);
    expect(root.children[0]).toMatchObject({
      tagName: "h1",
      children: [
        {
          type: "text",
          value: "Lorem ipsum 1",
        },
      ],
    });
    expect(root.children[1]).toMatchObject({
      type: "text",
      value: "\n",
    });
    expect(root.children[2]).toMatchObject({
      tagName: "p",
      children: [
        {
          type: "text",
          value: "Lorem ipsum 2",
        },
      ],
    });
  });

  it("renders a mix of paragraph and heading", () => {
    const root = parseMarkdown(["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n"));

    expect(root.children).toHaveLength(3);
    expect(root.children[0]).toMatchObject({
      tagName: "p",
      children: [
        {
          type: "text",
          value: "Lorem ipsum 1",
        },
      ],
    });
    expect(root.children[1]).toMatchObject({
      type: "text",
      value: "\n",
    });
    expect(root.children[2]).toMatchObject({
      tagName: "h1",
      children: [
        {
          type: "text",
          value: "Lorem ipsum 2",
        },
      ],
    });
  });
});
