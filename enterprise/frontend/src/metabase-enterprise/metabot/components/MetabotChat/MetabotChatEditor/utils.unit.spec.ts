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
