import { type Editor, Extension, type Range } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

export interface MentionOptions {
  HTMLAttributes: Record<string, unknown>;
  renderText: (props: {
    options: MentionOptions;
    node: ProseMirrorNode;
  }) => string;
  suggestion: Partial<SuggestionOptions>;
}

interface MentionProps {
  type?: string;
  id?: number | string;
  model?: string;
}

export const MentionPluginKey = new PluginKey("mention");

export const MentionExtension = Extension.create<MentionOptions>({
  name: "mention",

  addOptions() {
    return {
      HTMLAttributes: {},
      renderText({ options, node }) {
        return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
      },
      suggestion: {
        char: "@",
        pluginKey: MentionPluginKey,
        allowSpaces: true,
        items: ({ query: _query }: { query: string }) => [],
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: MentionProps;
        }) => {
          if (props.id && props.model) {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: "smartLink",
                attrs: {
                  entityId: props.id,
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
