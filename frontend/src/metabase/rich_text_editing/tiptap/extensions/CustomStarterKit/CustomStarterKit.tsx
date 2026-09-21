import {
  type AnyExtension,
  callOrReturn,
  getExtensionField,
} from "@tiptap/core";
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
import type { BlockShellComponent } from "../shared/BlockShell";

declare module "@tiptap/core" {
  // This adds a new configuration option to the NodeConfig
  interface NodeConfig {
    disableDropCursor?: boolean | null;
  }
}

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

interface CustomStarterKitOptions extends StarterKitOptions {
  paragraph: StarterKitOptions["paragraph"] & {
    editorContext?: "comments" | "document";
  };
  /**
   * Block "shell" component injected into the top-level block node views. Lets a
   * host (e.g. documents) attach block-level chrome such as comment and anchor
   * menus without the editor primitive depending on the host. When omitted the
   * blocks render with no extra chrome.
   */
  blockShell?: BlockShellComponent;
}

/** Merge the shared `blockShell` option into a block's own configure options. */
const withBlockShell = (
  blockOptions: unknown,
  blockShell: BlockShellComponent | undefined,
) => ({
  ...(typeof blockOptions === "object" && blockOptions ? blockOptions : {}),
  blockShell,
});

/**
 * Modified StarterKit so it doesn't hijack browsers' cmd/ctrl+shift+b behavior
 */
export const CustomStarterKit = StarterKit.extend<CustomStarterKitOptions>({
  name: "customStarterKit",
  addExtensions() {
    let extensions = this.parent?.() || [];
    const { blockShell } = this.options;

    if (this.options.blockquote !== false) {
      extensions = replaceExtension(
        extensions,
        Blockquote,
        CustomBlockquote.configure(
          withBlockShell(this.options.blockquote, blockShell),
        ),
      );
    }

    if (this.options.bulletList !== false) {
      extensions = replaceExtension(
        extensions,
        BulletList,
        CustomBulletList.configure(
          withBlockShell(this.options.bulletList, blockShell),
        ),
      );
    }

    if (this.options.orderedList !== false) {
      extensions = replaceExtension(
        extensions,
        OrderedList,
        CustomOrderedList.configure(
          withBlockShell(this.options.orderedList, blockShell),
        ),
      );
    }

    if (this.options.heading !== false) {
      extensions = replaceExtension(
        extensions,
        Heading,
        CustomHeading.configure(
          withBlockShell(this.options.heading, blockShell),
        ),
      );
    }

    if (this.options.paragraph !== false) {
      extensions = replaceExtension(
        extensions,
        Paragraph,
        CustomParagraph.configure(
          withBlockShell(this.options.paragraph, blockShell),
        ),
      );
    }

    if (this.options.codeBlock !== false) {
      extensions = replaceExtension(
        extensions,
        CodeBlock,
        CustomCodeBlock.configure(
          withBlockShell(this.options.codeBlock, blockShell),
        ),
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

  // fixup for tiptap's wrapper over https://github.com/ProseMirror/prosemirror-dropcursor to enable "disableDropCursor" setting
  extendNodeSchema(extension) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
    };

    return {
      disableDropCursor:
        callOrReturn(
          getExtensionField(extension, "disableDropCursor", context),
        ) ?? null,
    };
  },
});
