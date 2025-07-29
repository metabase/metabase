import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import {
  type MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";

// Node serializers - how ProseMirror nodes are converted to markdown
export const NODE_SERIALIZERS: MarkdownSerializer["nodes"] = {
  // Document node
  [Document.name]: (state, node) => state.renderContent(node),

  // Text nodes
  [Text.name]: defaultMarkdownSerializer.nodes.text,
  [Paragraph.name]: (state, node, parent, index) => {
    // FIXME: this does not work :(
    // Handle empty paragraphs to preserve blank lines
    if (node.content.size === 0) {
      // For empty paragraphs, write a newline to preserve the blank line
      state.write("\n");
    } else {
      // Use default behavior for non-empty paragraphs
      defaultMarkdownSerializer.nodes.paragraph(state, node, parent, index);
    }
  },

  // Headings
  [Heading.name]: defaultMarkdownSerializer.nodes.heading,

  // Lists
  [BulletList.name]: defaultMarkdownSerializer.nodes.bullet_list,
  [OrderedList.name]: defaultMarkdownSerializer.nodes.ordered_list,
  [ListItem.name]: defaultMarkdownSerializer.nodes.list_item,

  // Blocks
  [Blockquote.name]: defaultMarkdownSerializer.nodes.blockquote,
  [CodeBlock.name]: defaultMarkdownSerializer.nodes.code_block,
  [HorizontalRule.name]: defaultMarkdownSerializer.nodes.horizontal_rule,

  // Breaks
  [HardBreak.name]: defaultMarkdownSerializer.nodes.hard_break,

  // Image (from TipTap Image extension)
  [Image.name]: defaultMarkdownSerializer.nodes.image,
};

// Mark serializers - how ProseMirror marks are converted to markdown
export const MARK_SERIALIZERS: MarkdownSerializer["marks"] = {
  [Bold.name]: defaultMarkdownSerializer.marks.strong,
  [Italic.name]: defaultMarkdownSerializer.marks.em,
  [Code.name]: defaultMarkdownSerializer.marks.code,
  link: defaultMarkdownSerializer.marks.link,
  [Strike.name]: {
    open: "~~",
    close: "~~",
    mixable: true,
    expelEnclosingWhitespace: true,
  },
  [Underline.name]: {
    open: "<u>",
    close: "</u>",
    mixable: true,
    expelEnclosingWhitespace: true,
  },
};

export function createNodeSerializers(
  extraSerializers: MarkdownSerializer["nodes"] = {},
): MarkdownSerializer["nodes"] {
  return { ...NODE_SERIALIZERS, ...extraSerializers };
}

export function createMarkSerializers(
  extraSerializers: MarkdownSerializer["marks"] = {},
): MarkdownSerializer["marks"] {
  return { ...MARK_SERIALIZERS, ...extraSerializers };
}
