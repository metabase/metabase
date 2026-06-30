import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import { decodeAdhocChartPayload } from "metabase/metabot/utils/adhoc-mention";
import styles from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode.module.css";

export interface AdhocChartMentionAttributes {
  payload?: string;
  label?: string;
}

/**
 * An inline, non-editable chip representing a Metabot chart pasted into the
 * prompt as an ad-hoc reference (it is NOT saved). Renders with the same look as
 * a regular `SmartLink` mention. `payload` is the base64 ad-hoc chart spec (see
 * `metabase/metabot/utils/adhoc-mention`); on submit it is decoded into
 * `user_is_viewing` context so the model can act on the chart.
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
  const getIcon = useGetIcon();
  const { payload, label } = node.attrs as AdhocChartMentionAttributes;
  const display =
    (payload && decodeAdhocChartPayload(payload)?.display) || "table";
  const iconData = getIcon({ model: "card", display });

  return (
    <NodeViewWrapper as="span" data-type="adhoc-chart-mention">
      <span className={styles.smartLink}>
        <span className={styles.smartLinkInner}>
          <EntityIcon {...iconData} className={styles.icon} />
          {label}
        </span>
      </span>
    </NodeViewWrapper>
  );
}
