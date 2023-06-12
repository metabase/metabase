import { getLeadingText, parseMarkdown } from "./markdown";

describe("getLeadingText", () => {
  it("extracts leading text from a single paragraph", () => {
    const root = parseMarkdown("Lorem ipsum");

    expect(getLeadingText(root)).toBe("Lorem ipsum");
  });

  it("extracts leading text from a single heading", () => {
    const root = parseMarkdown("# Lorem ipsum");

    expect(getLeadingText(root)).toBe("Lorem ipsum");
  });

  it("extracts leading text from a heading and a paragraph", () => {
    const root = parseMarkdown(
      ["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n\n"),
    );

    expect(getLeadingText(root)).toBe("Lorem ipsum 1");
  });

  it("extracts leading text from a paragraph and a heading", () => {
    const root = parseMarkdown(
      ["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n\n"),
    );

    expect(getLeadingText(root)).toBe("Lorem ipsum 1");
  });

  it("skips images and their attributes", () => {
    const root = parseMarkdown("![alt](https://example.com/img.jpg)");

    expect(getLeadingText(root)).not.toBe("alt");
    expect(getLeadingText(root)).not.toBe("https://example.com/img.jpg");
    expect(getLeadingText(root)).toBe("");
  });

  it("skips elements without content", () => {
    const h1 = "# ";
    const p = "Lorem ipsum";
    const img = "![alt](https://example.com)";

    expect(getLeadingText(parseMarkdown([p, img, h1].join("\n\n")))).toBe(p);
    expect(getLeadingText(parseMarkdown([h1, p, img].join("\n\n")))).toBe(p);
    expect(getLeadingText(parseMarkdown([img, h1, p].join("\n\n")))).toBe(p);
  });

  it("extracts an empty string when no element has any content", () => {
    const h1 = "# ";
    const p = "";
    const img = "![alt](https://example.com)";

    expect(getLeadingText(parseMarkdown([h1].join("\n\n")))).toBe("");
    expect(getLeadingText(parseMarkdown([p].join("\n\n")))).toBe("");
    expect(getLeadingText(parseMarkdown([img].join("\n\n")))).toBe("");
    expect(getLeadingText(parseMarkdown([p, img, h1].join("\n\n")))).toBe("");
    expect(getLeadingText(parseMarkdown([].join("\n\n")))).toBe("");
  });
});

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

  it("renders a heading and a paragraph", () => {
    const root = parseMarkdown(
      ["# Lorem ipsum 1", "Lorem ipsum 2"].join("\n\n"),
    );

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

  it("renders a paragraph and a heading", () => {
    const root = parseMarkdown(
      ["Lorem ipsum 1", "# Lorem ipsum 2"].join("\n\n"),
    );

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
