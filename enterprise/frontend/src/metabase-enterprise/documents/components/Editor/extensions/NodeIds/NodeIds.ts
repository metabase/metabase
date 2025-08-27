import { Extension } from "@tiptap/core";
import { Plugin } from "prosemirror-state";

import { uuid } from "metabase/lib/uuid";

const ATTRIBUTE_NAME = "_id";

export const NodeIds = Extension.create({
  name: "nodeIds",
  addGlobalAttributes() {
    return [
      {
        types: ["*"],
        attributes: {
          [ATTRIBUTE_NAME]: {
            default: null,
            parseHTML: (el) => el.getAttribute(ATTRIBUTE_NAME) || null,
            renderHTML: (attrs) =>
              attrs[ATTRIBUTE_NAME]
                ? { [ATTRIBUTE_NAME]: attrs[ATTRIBUTE_NAME] }
                : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_trs, _old, state) => {
          const { doc, tr } = state;
          let updated = false;

          doc.forEach((node, pos) => {
            // top-level block nodes only
            if (node.type.isBlock && node.attrs[ATTRIBUTE_NAME] == null) {
              tr.setNodeAttribute(pos, ATTRIBUTE_NAME, uuid());

              updated = true;
            }
          });

          return updated ? tr : null;
        },
      }),
    ];
  },
});
