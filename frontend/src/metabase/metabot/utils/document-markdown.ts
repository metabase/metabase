import type { JSONContent } from "@tiptap/core";

import { wrapCardEmbed } from "metabase/rich_text_editing/tiptap/extensions/shared/layout";

import { markdownWithChartsToNodes } from "./conversation-to-document";

// Serializing a document to Markdown for an edit turn and rebuilding it from the
// model's reply. Charts are represented as `[[chart:N]]` placeholder lines so the
// model can keep them in place without seeing (or mangling) the embedded card
// ids; `embedCardIds[N-1]` maps placeholder N back to the real card it embeds.

type Mark = { type: string; attrs?: Record<string, unknown> };

function escapeText(text: string): string {
  // Escape the few Markdown markers our parser treats specially so round-tripped
  // prose isn't reinterpreted as formatting.
  return text.replace(/([\\`*_~])/g, "\\$1");
}

function inlineToMarkdown(nodes: JSONContent[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "\n";
      }
      if (node.type !== "text" || typeof node.text !== "string") {
        return "";
      }
      const marks = (node.marks ?? []) as Mark[];
      const has = (type: string) => marks.some((m) => m.type === type);

      if (has("code")) {
        return `\`${node.text}\``;
      }
      let text = escapeText(node.text);
      if (has("italic")) {
        text = `*${text}*`;
      }
      if (has("bold")) {
        text = `**${text}**`;
      }
      if (has("strike")) {
        text = `~~${text}~~`;
      }
      const link = marks.find((m) => m.type === "link");
      if (link?.attrs?.href) {
        text = `[${text}](${String(link.attrs.href)})`;
      }
      return text;
    })
    .join("");
}

// Pull the cardEmbed nodes out of a wrapper (resizeNode / flexContainer), in
// order, so each becomes its own `[[chart:N]]` placeholder.
function collectCardEmbeds(node: JSONContent): JSONContent[] {
  if (node.type === "cardEmbed") {
    return [node];
  }
  return (node.content ?? []).flatMap(collectCardEmbeds);
}

/**
 * Serialize a ProseMirror document to Markdown for a Metabot edit turn. Each
 * embedded chart becomes a `[[chart:N]]` placeholder line; the returned
 * `embedCardIds` records which card id each placeholder stands for so the reply
 * can be reassembled with `markdownToDocument`.
 */
export function documentToMarkdown(doc: JSONContent | null | undefined): {
  markdown: string;
  embedCardIds: number[];
} {
  const embedCardIds: number[] = [];
  const blocks: string[] = [];

  const pushChart = (cardId: number) => {
    embedCardIds.push(cardId);
    blocks.push(`[[chart:${embedCardIds.length}]]`);
  };

  for (const node of doc?.content ?? []) {
    switch (node.type) {
      case "heading": {
        const level = Number(node.attrs?.level ?? 1);
        blocks.push(`${"#".repeat(level)} ${inlineToMarkdown(node.content)}`);
        break;
      }
      case "paragraph":
        blocks.push(inlineToMarkdown(node.content));
        break;
      case "bulletList":
        blocks.push(
          (node.content ?? [])
            .map((item) => `- ${inlineToMarkdown(item.content?.[0]?.content)}`)
            .join("\n"),
        );
        break;
      case "orderedList":
        blocks.push(
          (node.content ?? [])
            .map(
              (item, i) =>
                `${i + 1}. ${inlineToMarkdown(item.content?.[0]?.content)}`,
            )
            .join("\n"),
        );
        break;
      case "blockquote":
        blocks.push(
          (node.content ?? [])
            .map((p) => `> ${inlineToMarkdown(p.content)}`)
            .join("\n"),
        );
        break;
      case "codeBlock":
        blocks.push(
          `\`\`\`\n${(node.content ?? []).map((t) => t.text ?? "").join("")}\n\`\`\``,
        );
        break;
      case "horizontalRule":
        blocks.push("---");
        break;
      case "resizeNode":
      case "flexContainer":
        for (const embed of collectCardEmbeds(node)) {
          if (typeof embed.attrs?.id === "number") {
            pushChart(embed.attrs.id);
          }
        }
        break;
      case "cardEmbed":
        if (typeof node.attrs?.id === "number") {
          pushChart(node.attrs.id);
        }
        break;
      default:
        break;
    }
  }

  return { markdown: blocks.join("\n\n"), embedCardIds };
}

/**
 * Rebuild a document from an edited Markdown body, resolving each `[[chart:N]]`
 * placeholder back to the original embedded card id (from `documentToMarkdown`).
 * Placeholders out of range are dropped.
 */
export function markdownToDocument(
  markdown: string,
  embedCardIds: number[],
): JSONContent {
  const resolveChart = (n: number): JSONContent[] => {
    const id = embedCardIds[n - 1];
    return typeof id === "number"
      ? [wrapCardEmbed({ type: "cardEmbed", attrs: { id } })]
      : [];
  };
  const content = markdownWithChartsToNodes(markdown, resolveChart);
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}
