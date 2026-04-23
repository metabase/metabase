import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Editor } from "@tiptap/react";

import { CardEmbed } from "metabase/rich_text_editing/tiptap/extensions/CardEmbed/CardEmbedNode";

import { stampCardEmbedUpdated, updateCardEmbedNodeId } from "./editorNodeUtils";

function buildEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, CardEmbed],
    content: {
      type: "doc",
      content: [
        { type: "cardEmbed", attrs: { id: 1, _id: "a" } },
        { type: "cardEmbed", attrs: { id: 2, _id: "b" } },
      ],
    },
  });
}

function getCardEmbeds(editor: Editor) {
  const embeds: Array<{ id: number | null; updatedAt: number | null }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "cardEmbed") {
      embeds.push({
        id: node.attrs.id,
        updatedAt: node.attrs.updatedAt,
      });
    }
  });
  return embeds;
}

describe("editorNodeUtils", () => {
  describe("stampCardEmbedUpdated", () => {
    it("bumps updatedAt on the selected card embed", () => {
      const editor = buildEditor();
      const before = Date.now();

      stampCardEmbedUpdated(editor, 1);

      const [first, second] = getCardEmbeds(editor);
      expect(first.updatedAt).toBeNull();
      expect(second.updatedAt).not.toBeNull();
      expect(second.updatedAt).toBeGreaterThanOrEqual(before);
      editor.destroy();
    });

    it("is a no-op when the editor is null", () => {
      expect(() => stampCardEmbedUpdated(null, 0)).not.toThrow();
    });

    it("is a no-op when the index is null", () => {
      const editor = buildEditor();
      stampCardEmbedUpdated(editor, null);
      expect(getCardEmbeds(editor).every((e) => e.updatedAt == null)).toBe(
        true,
      );
      editor.destroy();
    });

    it("does not touch other card embeds", () => {
      const editor = buildEditor();
      stampCardEmbedUpdated(editor, 0);
      const [first, second] = getCardEmbeds(editor);
      expect(first.updatedAt).not.toBeNull();
      expect(second.updatedAt).toBeNull();
      editor.destroy();
    });
  });

  describe("updateCardEmbedNodeId", () => {
    it("sets both id and updatedAt on the selected embed", () => {
      const editor = buildEditor();
      const before = Date.now();

      updateCardEmbedNodeId(editor, 0, 42);

      const [first, second] = getCardEmbeds(editor);
      expect(first.id).toBe(42);
      expect(first.updatedAt).toBeGreaterThanOrEqual(before);
      expect(second.id).toBe(2);
      expect(second.updatedAt).toBeNull();
      editor.destroy();
    });
  });
});
