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
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import {
  type MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";

// Node serializers - how ProseMirror nodes are converted to markdown
export const NODE_SERIALIZERS: MarkdownSerializer["nodes"] = {
  doc: (state, node) => {
    state.renderContent(node);
  },

  // Text nodes
  [Text.name]: defaultMarkdownSerializer.nodes.text,
  [Paragraph.name]: (state, node, parent, index) => {
    // Handle empty paragraphs at document level
    if (parent.type.name === "doc" && node.content.size === 0) {
      // Look ahead to find consecutive empty paragraphs
      let emptyCount = 1; // Current paragraph is empty
      let nextIndex = index + 1;

      while (nextIndex < parent.childCount) {
        const nextChild = parent.child(nextIndex);
        if (
          nextChild.type.name === "paragraph" &&
          nextChild.content.size === 0
        ) {
          emptyCount++;
          nextIndex++;
        } else {
          break;
        }
      }

      // Only output spacer for the FIRST empty paragraph in a sequence
      // The rest will be skipped by checking if we're in the middle of a sequence
      let isFirstInSequence = true;
      if (index > 0) {
        const prevChild = parent.child(index - 1);
        if (
          prevChild.type.name === "paragraph" &&
          prevChild.content.size === 0
        ) {
          isFirstInSequence = false;
        }
      }

      if (isFirstInSequence) {
        state.write(`{% spacer lines=${emptyCount} %}`);
        state.closeBlock(node);
      }
      // Skip subsequent empty paragraphs in the sequence
    } else {
      // Handle non-empty paragraphs or paragraphs in nested contexts normally
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

  // Card embed nodes
  cardEmbed: (state, node) => {
    if (node.attrs.customName) {
      state.write(
        `{% card id=${node.attrs.cardId} snapshot=${node.attrs.snapshotId} name="${node.attrs.customName}" %}`,
      );
    } else {
      state.write(
        `{% card id=${node.attrs.cardId} snapshot=${node.attrs.snapshotId} %}`,
      );
    }
    state.closeBlock(node);
  },

  // Smart link nodes
  smartLink: (state, node) => {
    state.write(
      `{% link url="${node.attrs.url}" text="${node.attrs.text}" icon="${node.attrs.icon}" %}`,
    );
  },
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
