import type { JSONContent } from "@tiptap/react";

import { doesDocumentNeedMigration } from "./editorNodeUtils";

describe("doesDocumentNeedMigration", () => {
  it("returns false for an empty doc", () => {
    expect(
      doesDocumentNeedMigration({
        type: "doc",
        content: [],
      }),
    ).toBe(false);
  });

  it("returns false when all commentable nodes have _id attributes", () => {
    expect(
      doesDocumentNeedMigration({
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { _id: "paragraph-1" },
            content: [{ type: "text", text: "Hello" }],
          },
          {
            type: "heading",
            attrs: { _id: "heading-1", level: 1 },
            content: [{ type: "text", text: "Title" }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("returns true when a top-level paragraph is missing _id", () => {
    expect(
      doesDocumentNeedMigration({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns true when a commentable list node is missing _id", () => {
    expect(
      doesDocumentNeedMigration({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    attrs: { _id: "paragraph-1" },
                    content: [{ type: "text", text: "Item" }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns true when a nested commentable node is missing _id", () => {
    expect(
      doesDocumentNeedMigration({
        type: "doc",
        content: [
          {
            type: "blockquote",
            attrs: { _id: "blockquote-1" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Quote" }],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns true when a card embed is missing _id", () => {
    expect(
      doesDocumentNeedMigration({
        type: "doc",
        content: [
          {
            type: "cardEmbed",
            attrs: { id: 42 },
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns false for text-only nodes", () => {
    expect(
      doesDocumentNeedMigration(
        // Unjustified type cast. FIXME
        {
          type: "text",
          text: "Hello",
        } as JSONContent,
      ),
    ).toBe(false);
  });
});
