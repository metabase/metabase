import type { Attribute } from "@tiptap/core";
import { NodeSelection, Plugin, TextSelection } from "prosemirror-state";

import { uuid } from "metabase/lib/uuid";

import { ID_ATTRIBUTE_NAME } from "./constants";

type Attributes = {
  [key: string]: Attribute;
};

export function createIdAttribute() {
  return {
    [ID_ATTRIBUTE_NAME]: {
      default: () => uuid(),
      parseHTML: (el: HTMLElement) =>
        el.getAttribute(ID_ATTRIBUTE_NAME) || null,
      renderHTML: (attrs: Attributes) =>
        attrs[ID_ATTRIBUTE_NAME]
          ? { [ID_ATTRIBUTE_NAME]: attrs[ID_ATTRIBUTE_NAME] }
          : {},
    },
  };
}

// needed to upgrade documents without ids and to fix duplicated ids when splitting nodes
export function createProseMirrorPlugin(nodeName: string) {
  return new Plugin({
    appendTransaction: (_trs, _old, state) => {
      const { doc, tr } = state;
      let updated = false;

      // Check if any nodes were split (have the same _id)
      const seenIds = new Set();

      doc.descendants((node, pos) => {
        const isRightNode = node.type.name === nodeName;
        const _id = node.attrs[ID_ATTRIBUTE_NAME];
        const hasNoId = _id == null;
        const isDuplicate = seenIds.has(_id);

        if (_id) {
          seenIds.add(_id);
        }

        if ((isRightNode && hasNoId) || isDuplicate) {
          tr.setNodeAttribute(pos, ID_ATTRIBUTE_NAME, uuid());
          updated = true;
        }
      });

      return updated ? tr : null;
    },
    props: {
      handleKeyDown: (view) => {
        const { state } = view;
        // Check if our selection is a node selection and
        // if the selected node is the one we wish to protect.
        if (
          state.selection instanceof NodeSelection &&
          (state.selection.node.type.name === "cardEmbed" ||
            state.selection.node.type.name === "resizeNode")
        ) {
          view.dispatch(
            state.tr.setSelection(
              TextSelection.create(state.doc, state.selection.to + 1),
            ),
          );
        }
        return false;
      },
    },
  });
}
