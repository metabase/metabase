import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { isMetabaseEntityUrl, parseMetabaseUrl } from "../utils/urlParsing";

export interface MetabotPasteOptions {
  // Options can be added here if needed in the future
}

export const MetabotPasteExtension = Extension.create<MetabotPasteOptions>({
  name: "metabotPaste",

  addOptions() {
    return {
      // Default options
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("metabotPaste"),
        props: {
          handlePaste: (view, event, _slice) => {
            // Get the pasted content as text
            const clipboardData = event.clipboardData;
            if (!clipboardData) {
              return false;
            }

            const text = clipboardData.getData("text/plain");

            // Check if the pasted text looks like a Metabase URL
            if (isMetabaseEntityUrl(text)) {
              const entityInfo = parseMetabaseUrl(text);

              if (entityInfo) {
                // Prevent default paste behavior
                event.preventDefault();

                // Insert a MetabotSmartLink node instead
                const { model, id, name } = entityInfo;

                // Map URL model types to internal Metabase types for SmartLink component
                const internalModel = model === "model" ? "dataset" : model;

                view.dispatch(
                  view.state.tr
                    .replaceSelectionWith(
                      view.state.schema.nodes.metabotSmartLink.create({
                        entityId: id,
                        model: internalModel,
                        label: name,
                      }),
                    )
                    .insertText(" "), // Add space after the link
                );

                return true; // Handled
              }
            }

            // Let other paste handlers deal with it
            return false;
          },
        },
      }),
    ];
  },
});
