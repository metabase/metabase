import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import Underline from "@tiptap/extension-underline";
import type { Token } from "markdown-it";
import type { ParseSpec } from "prosemirror-markdown";

import { CardEmbedNode } from "../CardEmbed/CardEmbedNode";
import { SmartLinkNode } from "../SmartLink/SmartLinkNode";

// Parser tokens - how markdown tokens are converted to ProseMirror nodes/marks
export const PARSER_TOKENS: Record<string, ParseSpec> = {
  // Basic blocks
  paragraph: { block: Paragraph.name },
  blockquote: { block: Blockquote.name },
  heading: {
    block: Heading.name,
    getAttrs: (tok: Token) => ({ level: +tok.tag.slice(1) }),
  },

  // Lists
  bullet_list: { block: BulletList.name },
  ordered_list: {
    block: OrderedList.name,
    getAttrs: (tok: Token) => ({ order: +(tok.attrGet("start") ?? 1) }),
  },
  list_item: { block: ListItem.name },

  // Code
  code_block: { block: CodeBlock.name, noCloseToken: true },
  fence: {
    block: CodeBlock.name,
    getAttrs: (tok: Token) => ({ params: tok.info || "" }),
    noCloseToken: true,
  },

  // Other nodes
  hr: { node: HorizontalRule.name },
  hardbreak: { node: HardBreak.name },
  image: {
    node: Image.name,
    getAttrs: (tok: Token) => ({
      src: tok.attrGet("src"),
      alt: tok.content || null,
      title: tok.attrGet("title") || null,
    }),
  },

  // Marks
  strong: { mark: Bold.name },
  em: { mark: Italic.name },
  code_inline: { mark: Code.name, noCloseToken: true },
  link: {
    mark: "link",
    getAttrs: (tok: Token) => ({
      href: tok.attrGet("href"),
      title: tok.attrGet("title") || null,
    }),
  },
  s: { mark: Strike.name },
  u: { mark: Underline.name },

  // Custom nodes
  card: {
    node: CardEmbedNode.name,
    getAttrs: (tok: Token) => ({
      id: parseInt(tok.attrGet("id") || "0", 10),
      snapshotId: parseInt(tok.attrGet("snapshot") || "0", 10),
      name: tok.attrGet("name") || null,
    }),
  },
  smartlink: {
    node: SmartLinkNode.name,
    getAttrs: (tok: Token) => ({
      url: tok.attrGet("url"),
      text: tok.attrGet("text"),
      icon: tok.attrGet("icon"),
    }),
  },
};

export function createParserTokens(
  extraTokens: Record<string, ParseSpec> = {},
): Record<string, ParseSpec> {
  return { ...PARSER_TOKENS, ...extraTokens };
}
