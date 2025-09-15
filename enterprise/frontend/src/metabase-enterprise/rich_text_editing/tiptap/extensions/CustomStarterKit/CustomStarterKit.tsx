import type { AnyExtension } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { BulletList } from "@tiptap/extension-bullet-list";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Heading } from "@tiptap/extension-heading";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { StarterKit, type StarterKitOptions } from "@tiptap/starter-kit";

import { CustomBlockquote } from "../Blockquote";
import { CustomBulletList } from "../BulletList";
import { CustomCodeBlock } from "../CodeBlock";
import { CustomHeading } from "../Heading";
import { CustomOrderedList } from "../OrderedList";
import { CustomParagraph } from "../Paragraph";

const CustomBold = Bold.extend({
  addKeyboardShortcuts() {
    // "Mod-b" (sans shift key) is fine, "Mod-B" (with shift key) should not be hijacked
    // https://github.com/ueberdosis/tiptap/blob/v3.3.0/packages/extension-bold/src/bold.tsx#L116
    return {
      "Mod-b": () => this.editor.commands.toggleBold(),
    };
  },
});

const replaceExtension = <T extends AnyExtension>(
  extensions: T[],
  target: T,
  replacement: T,
): T[] => {
  const index = extensions.findIndex((ext) => ext.name === target.name);
  if (index === -1) {
    return extensions;
  }
  const clone = [...extensions];
  clone.splice(index, 1, replacement);
  return clone;
};

/**
 * Modified StarterKit so it doesn't hijack browsers' cmd/ctrl+shift+b behavior
 */
export const CustomStarterKit = StarterKit.extend<StarterKitOptions>({
  name: "customStarterKit",
  addExtensions() {
    let extensions = this.parent?.() || [];

    if (this.options.blockquote !== false) {
      extensions = replaceExtension(
        extensions,
        Blockquote,
        CustomBlockquote.configure(this.options.blockquote),
      );
    }

    if (this.options.bulletList !== false) {
      extensions = replaceExtension(
        extensions,
        BulletList,
        CustomBulletList.configure(this.options.bulletList),
      );
    }

    if (this.options.orderedList !== false) {
      extensions = replaceExtension(
        extensions,
        OrderedList,
        CustomOrderedList.configure(this.options.orderedList),
      );
    }

    if (this.options.heading !== false) {
      extensions = replaceExtension(
        extensions,
        Heading,
        CustomHeading.configure(this.options.heading),
      );
    }

    if (this.options.paragraph !== false) {
      extensions = replaceExtension(
        extensions,
        Paragraph,
        CustomParagraph.configure(this.options.paragraph),
      );
    }

    if (this.options.codeBlock !== false) {
      extensions = replaceExtension(
        extensions,
        CodeBlock,
        CustomCodeBlock.configure(this.options.codeBlock),
      );
    }

    if (this.options.bold !== false) {
      extensions = replaceExtension(
        extensions,
        Bold,
        CustomBold.configure(this.options.bold),
      );
    }

    return extensions;
  },
});
