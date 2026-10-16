import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  PRODUCT_ANALYTICS_DOCUMENT_ATTR,
  type ProductAnalyticsDocumentContext,
} from "metabase-types/api";
import { getProductAnalyticsDocumentContext } from "metabase-types/guards";

/** Lets the doc node hold what the document's analyses share. */
export const AnalysisDocumentAttributes = Extension.create({
  name: "productAnalyticsDocument",

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          [PRODUCT_ANALYTICS_DOCUMENT_ATTR]: {
            default: null,
            rendered: false,
          },
        },
      },
    ];
  },
});

/** Undefined until the document's context is first written. */
export const readDocumentContext = (
  doc: ProseMirrorNode,
): ProductAnalyticsDocumentContext | undefined =>
  getProductAnalyticsDocumentContext({ attrs: doc.attrs });

type WriteDocumentContextOptions = {
  /** False for writes the user didn't make, so undo skips them. */
  addToHistory?: boolean;
};

export const writeDocumentContext = (
  editor: Editor,
  context: ProductAnalyticsDocumentContext,
  { addToHistory = true }: WriteDocumentContextOptions = {},
) => {
  const tr = editor.state.tr
    .setDocAttribute(PRODUCT_ANALYTICS_DOCUMENT_ATTR, context)
    .setMeta("addToHistory", addToHistory);
  editor.view.dispatch(tr);
};
