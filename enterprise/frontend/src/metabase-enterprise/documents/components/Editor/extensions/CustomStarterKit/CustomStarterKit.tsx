import type { AnyExtension } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { StarterKit, type StarterKitOptions } from "@tiptap/starter-kit";

const CustomBlockquote = Blockquote.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

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
