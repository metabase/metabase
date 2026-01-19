import type { JSONContent } from "@tiptap/core";

import {
  parseMetabotMessageToTiptapDoc,
  serializeTiptapToMetabotMessage,
} from "./utils";

describe("MetabotChatEditor > utils", () => {
  describe("serializeTiptapToMetabotMessage", () => {
    it("should serialize smark links to metabot protocol links", () => {
      const input: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "smartLink",
                attrs: { label: "test", model: "table", entityId: "1" },
              },
            ],
          },
        ],
      };
      const result = serializeTiptapToMetabotMessage(input);

      expect(result).toBe("[test](metabase://table/1)");
    });

    it("should preserve newlines between paragraphs", () => {
      const input: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First line" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Second line" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Third line" }],
          },
        ],
      };
      const result = serializeTiptapToMetabotMessage(input);

      expect(result).toBe("First line\nSecond line\nThird line");
    });

    it("should not add trailing newline after last paragraph", () => {
      const input: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Only line" }],
          },
        ],
      };
      const result = serializeTiptapToMetabotMessage(input);

      expect(result).toBe("Only line");
    });

    it("should handle empty paragraphs", () => {
      const input: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First" }],
          },
          {
            type: "paragraph",
            content: [],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Third" }],
          },
        ],
      };
      const result = serializeTiptapToMetabotMessage(input);

      expect(result).toBe("First\n\nThird");
    });

    it("should handle hard breaks within paragraphs", () => {
      const input: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Line 1" },
              { type: "hardBreak" },
              { type: "text", text: "Line 2" },
            ],
          },
        ],
      };
      const result = serializeTiptapToMetabotMessage(input);

      expect(result).toBe("Line 1\nLine 2");
    });
  });

  describe("parseMetabotMessageToTiptapDoc", () => {
    it("should parse metabot protocol links", () => {
      const result = parseMetabotMessageToTiptapDoc(
        "[test](metabase://table/1)",
      );
      expect(result).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "smartLink",
                attrs: { label: "test", model: "table", entityId: "1" },
              },
            ],
          },
        ],
      });
    });
  });
});
