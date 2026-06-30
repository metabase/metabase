import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

import { Icon } from "metabase/ui";

import S from "./MetabotPromptInput.module.css";

export interface AdhocChartMentionAttributes {
  payload?: string;
  label?: string;
}

/**
 * An inline, non-editable chip representing a Metabot chart pasted into the
 * prompt as an ad-hoc reference (it is NOT saved). `payload` is the base64
 * ad-hoc chart spec (see `metabase/metabot/utils/adhoc-mention`); on submit it is
 * decoded into `user_is_viewing` context so the model can act on the chart.
 */
export const AdhocChartMention = Node.create({
  name: "adhocChartMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      payload: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-payload"),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="adhoc-chart-mention"]' }];
  },

  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({
        "data-type": "adhoc-chart-mention",
        "data-payload": node.attrs.payload,
        "data-label": node.attrs.label,
      }),
      node.attrs.label ?? "",
    ];
  },

  renderText({ node }) {
    return node.attrs.label ?? "";
  },

  addNodeView() {
    return ReactNodeViewRenderer(AdhocChartMentionComponent);
  },
});

function AdhocChartMentionComponent({ node }: NodeViewProps) {
  const { label } = node.attrs as AdhocChartMentionAttributes;
  return (
    <NodeViewWrapper as="span" data-type="adhoc-chart-mention">
      <span className={S.smartLink}>
        <Icon name="bar" size={12} />
        {label}
      </span>
    </NodeViewWrapper>
  );
}
