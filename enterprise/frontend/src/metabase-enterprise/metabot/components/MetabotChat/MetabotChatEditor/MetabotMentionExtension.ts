import type { Editor, Range } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

export interface MetabotMentionOptions {
  suggestion: Partial<SuggestionOptions>;
}

export interface MetabotMentionCommandProps {
  id: number | string;
  model: string;
  label: string;
}

export const MetabotMentionPluginKey = new PluginKey("metabotMention");

export const MetabotMentionExtension = Extension.create<MetabotMentionOptions>({
  name: "metabotMention",

  addOptions() {
    return {
      suggestion: {
        char: "@",
        pluginKey: MetabotMentionPluginKey,
        allowSpaces: true,

        // Command to insert MetabotSmartLink node when entity is selected
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: MetabotMentionCommandProps;
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "metabotSmartLink",
              attrs: {
                entityId: props.id,
                model: props.model,
                label: props.label,
              },
            })
            // TODO: adding double space because something is wrong in the parsing logic and this fixes it
            .insertContent("  ") // Add space after mention
            .run();
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
