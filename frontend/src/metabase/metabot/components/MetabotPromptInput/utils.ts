import type { JSONContent } from "@tiptap/core";
import {
  Fragment,
  Node,
  type Node as ProseMirrorNode,
  Slice,
} from "@tiptap/pm/model";
import { match } from "ts-pattern";

import {
  METABSE_PROTOCOL_MD_LINK,
  createMetabaseProtocolLink,
} from "metabase/metabot/utils/links";
import { mbProtocolModelToSuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";

function serializeNodes(nodes: JSONContent[]): string {
  return nodes
    .map((node, index) => {
      const serialized = serializeNode(node);
      // Add newline after paragraphs, except for the last one
      if (node.type === "paragraph" && index < nodes.length - 1) {
        return serialized + "\n";
      }
      return serialized;
    })
    .join("");
}

function serializeNode(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return serializeNodes(node.content ?? []);
    case "text":
      return node.text || "";
    case "smartLink": {
      const { entityId, model: entityModel, label } = node.attrs || {};
      if (!entityId || !entityModel) {
        console.warn("SmartLink missing required attributes", node);
        return label || "[unknown]";
      }
      return createMetabaseProtocolLink({
        id: entityId,
        model: match(entityModel)
          .with("dataset", () => "model" as const)
          .with("card", () => "question" as const)
          .otherwise(() => entityModel),
        name: label,
      });
    }
    case "hardBreak":
      return "\n";
    default:
      console.warn("Unhandled node type", node);
      return node.content ? serializeNodes(node.content) : node.text || "";
  }
}

export function serializeTiptapToMetabotMessage(content: JSONContent): string {
  return serializeNodes(content?.content || []).trim();
}

export const parseClipboardTextAsParagraphs = (
  text: string,
  context: { doc: ProseMirrorNode },
): Slice => {
  const blocks = text.split(/(?:\r\n?|\n)/);

  const nodes = blocks.map((line) => {
    return Node.fromJSON(context.doc.type.schema, {
      type: "paragraph",
      ...(line.length > 0 ? { content: [{ type: "text", text: line }] } : {}),
    });
  });

  const fragment = Fragment.fromArray(nodes);
  return Slice.maxOpen(fragment);
};

const MENTION_REGEX = new RegExp(METABSE_PROTOCOL_MD_LINK, "g");

export function parseMetabotMessageToTiptapDoc(text: string): JSONContent {
  // Split text by lines to handle paragraphs
  const content = text.split("\n").map<JSONContent>((line) => {
    const pContent: JSONContent[] = [];
    let lastIndex = 0;

    for (const match of line.matchAll(MENTION_REGEX)) {
      const [fullMatch, label, mbProtocolModel, entityId] = match;
      const model = mbProtocolModelToSuggestionModel(mbProtocolModel);

      // Add text before the mention
      if (match.index > lastIndex) {
        pContent.push({
          type: "text",
          text: line.slice(lastIndex, match.index),
        });
      }

      pContent.push({
        type: "smartLink",
        attrs: { label, model, entityId },
      });

      lastIndex = match.index + fullMatch.length;
    }

    // Add remaining text after last mention
    if (lastIndex < line.length) {
      pContent.push({
        type: "text",
        text: line.slice(lastIndex),
      });
    }

    return { type: "paragraph", content: pContent };
  });

  return {
    type: "doc",
    content:
      content.length > 0 ? content : [{ type: "paragraph", content: [] }],
  };
}
