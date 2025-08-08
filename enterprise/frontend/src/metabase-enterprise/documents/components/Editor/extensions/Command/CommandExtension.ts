import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

export interface CommandOptions {
  suggestion: Partial<SuggestionOptions>;
}

interface CommandProps {
  command?: string;
  clearQuery?: boolean;
  switchToLinkMode?: boolean;
  selectItem?: boolean;
  entityId?: number;
  model?: string;
}

export const CommandPluginKey = new PluginKey("command");

export const CommandExtension = Extension.create<CommandOptions>({
  name: "command",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: CommandPluginKey,
        allowSpaces: true,
        items: ({ query: _query }: { query: string }) => [],
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: CommandProps;
        }) => {
          if (props.clearQuery && props.switchToLinkMode) {
            const startPos = range.from + 1;
            editor
              .chain()
              .focus()
              .deleteRange({ from: startPos, to: range.to })
              .run();
            return;
          }
          if (props.selectItem && props.entityId && props.model) {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: "smartLink",
                attrs: {
                  entityId: props.entityId,
                  model: props.model,
                },
              })
              .run();
            return;
          }

          if (props.command === "linkTo") {
            return;
          }
          switch (props.command) {
            case "heading1":
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleHeading({ level: 1 })
                .run();
              break;
            case "heading2":
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleHeading({ level: 2 })
                .run();
              break;
            case "heading3":
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleHeading({ level: 3 })
                .run();
              break;
            case "bulletList":
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleBulletList()
                .run();
              break;
            case "orderedList":
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleOrderedList()
                .run();
              break;
            case "blockquote":
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .toggleBlockquote()
                .run();
              break;
            case "codeBlock":
              editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
              break;
          }
        },
        selectItem: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: CommandProps;
        }) => {
          if (props.entityId && props.model) {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: "smartLink",
                attrs: {
                  entityId: props.entityId,
                  model: props.model,
                },
              })
              .run();
          }
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
