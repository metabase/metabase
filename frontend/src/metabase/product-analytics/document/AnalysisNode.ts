import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import {
  createIdAttribute,
  createProseMirrorPlugin,
} from "metabase/rich_text_editing/tiptap/extensions/NodeIds";
import { getProductAnalyticsNodeDefinition } from "metabase-types/guards";

import { AnalysisNodeView } from "./AnalysisNodeView";
import { ANALYSIS_NODE_TYPE } from "./analysis-node-utils";

const DEFINITION_HTML_ATTR = "data-definition";

const parseDefinition = (json: string | null) => {
  if (json === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(json);
    return getProductAnalyticsNodeDefinition(value) ?? null;
  } catch {
    return null;
  }
};

/**
 * An analysis in a document. Its definition is rendered into the HTML too, so
 * copying and pasting an analysis duplicates it.
 */
export const AnalysisNode = Node.create({
  name: ANALYSIS_NODE_TYPE,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ...createIdAttribute(),
      // The card's height in px, set by dragging its resize handle. Null until resized.
      height: {
        default: null,
        parseHTML: (element) => {
          const value = parseInt(element.getAttribute("data-height") ?? "", 10);
          return Number.isFinite(value) ? value : null;
        },
        renderHTML: (attributes) =>
          attributes.height == null ? {} : { "data-height": attributes.height },
      },
      definition: {
        default: null,
        parseHTML: (element) =>
          parseDefinition(element.getAttribute(DEFINITION_HTML_ATTR)),
        renderHTML: (attributes) => ({
          [DEFINITION_HTML_ATTR]: JSON.stringify(attributes.definition),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${ANALYSIS_NODE_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": ANALYSIS_NODE_TYPE }),
    ];
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(ANALYSIS_NODE_TYPE)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnalysisNodeView);
  },
});
