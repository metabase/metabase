import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { useGetIcon } from "metabase/hooks/use-icon";
import styles from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode.module.css";
import type { CardDisplayType } from "metabase-types/api";

export interface ChartMentionAttributes {
  chartId?: string;
  label?: string;
  display?: CardDisplayType;
}

export const ChartMention = Node.create({
  name: "chartMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      chartId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-chart-id"),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
      },
      display: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-display"),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="chart-mention"]' }];
  },

  renderHTML({ node }) {
    return [
      "span",
      mergeAttributes({
        "data-type": "chart-mention",
        "data-chart-id": node.attrs.chartId,
        "data-label": node.attrs.label,
        "data-display": node.attrs.display,
      }),
      node.attrs.label ?? "",
    ];
  },

  renderText({ node }) {
    return node.attrs.label ?? "";
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartMentionComponent);
  },
});

function ChartMentionComponent({ node }: NodeViewProps) {
  const getIcon = useGetIcon();
  const { label, display } = node.attrs as ChartMentionAttributes;
  const iconData = getIcon({ model: "card", display: display || "table" });

  return (
    <NodeViewWrapper as="span" data-type="chart-mention">
      <span className={styles.smartLink}>
        <span className={styles.smartLinkInner}>
          <EntityIcon {...iconData} className={styles.icon} />
          {label}
        </span>
      </span>
    </NodeViewWrapper>
  );
}
