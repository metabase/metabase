import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";

export const DisableMetabotSidebar = Extension.create({
  name: "take-back-mod-b",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
              event.stopPropagation();
            }
          },
        },
      }),
    ];
  },
});
