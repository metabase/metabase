import type { JSONContent } from "@tiptap/core";

import { documentToMarkdown, markdownToDocument } from "./document-markdown";

describe("documentToMarkdown", () => {
  it("serializes headings, paragraphs, lists and inline marks to Markdown", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Sales" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Revenue is " },
            { type: "text", text: "up", marks: [{ type: "bold" }] },
            { type: "text", text: "." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "one" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "two" }] },
              ],
            },
          ],
        },
      ],
    };
    const { markdown, embedCardIds } = documentToMarkdown(doc);
    expect(markdown).toBe("# Sales\n\nRevenue is **up**.\n\n- one\n- two");
    expect(embedCardIds).toEqual([]);
  });

  it("represents chart embeds as ordered [[chart:N]] placeholders", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
        {
          type: "resizeNode",
          content: [{ type: "cardEmbed", attrs: { id: 42 } }],
        },
        {
          type: "resizeNode",
          content: [{ type: "cardEmbed", attrs: { id: 7 } }],
        },
      ],
    };
    const { markdown, embedCardIds } = documentToMarkdown(doc);
    expect(markdown).toBe("Intro\n\n[[chart:1]]\n\n[[chart:2]]");
    expect(embedCardIds).toEqual([42, 7]);
  });
});

describe("markdownToDocument", () => {
  it("rebuilds a document, resolving [[chart:N]] back to the original card ids", () => {
    const doc = markdownToDocument(
      "# Sales\n\nText.\n\n[[chart:1]]\n\n[[chart:2]]",
      [42, 7],
    );
    expect(doc.content).toEqual([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Sales" }],
      },
      { type: "paragraph", content: [{ type: "text", text: "Text." }] },
      {
        type: "resizeNode",
        content: [{ type: "cardEmbed", attrs: { id: 42 } }],
      },
      {
        type: "resizeNode",
        content: [{ type: "cardEmbed", attrs: { id: 7 } }],
      },
    ]);
  });

  it("round-trips a document with charts back to the same structure", () => {
    const original: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Report" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
        {
          type: "resizeNode",
          content: [{ type: "cardEmbed", attrs: { id: 99 } }],
        },
      ],
    };
    const { markdown, embedCardIds } = documentToMarkdown(original);
    expect(markdownToDocument(markdown, embedCardIds).content).toEqual(
      original.content,
    );
  });
});
