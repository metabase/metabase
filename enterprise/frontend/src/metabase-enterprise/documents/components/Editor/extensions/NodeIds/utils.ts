import type { Attribute } from "@tiptap/core";
import { Plugin } from "prosemirror-state";

import { uuid } from "metabase/lib/uuid";

import { ID_ATTRIBUTE_NAME } from "../NodeIds";

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

// needed to upgrade documents without ids
export function createProseMirrorPlugin(nodeName: string) {
  return new Plugin({
    appendTransaction: (_trs, _old, state) => {
      const { doc, tr } = state;
      let updated = false;

      doc.forEach((node, pos) => {
        if (
          node.type.name === nodeName &&
          node.attrs[ID_ATTRIBUTE_NAME] == null
        ) {
          tr.setNodeAttribute(pos, ID_ATTRIBUTE_NAME, uuid());
          updated = true;
        }
      });

      return updated ? tr : null;
    },
  });
}
