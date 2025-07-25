import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { memo } from "react";

import { Icon } from "metabase/ui";

import styles from "./SmartLinkNode.module.css";

export interface SmartLinkAttributes {
  entityId: number;
  model: string;
}

export const SmartLinkNode = Node.create<{
  HTMLAttributes: Record<string, unknown>;
}>({
  name: "smartLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-url"),
      },
      text: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-text"),
      },
      icon: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-icon"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="smart-link"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "smart-link",
          "data-url": node.attrs.url,
          "data-text": node.attrs.text,
          "data-icon": node.attrs.icon,
        },
        this.options.HTMLAttributes,
      ),
      `{{link:${node.attrs.url}:${node.attrs.text}:${node.attrs.icon}}}`,
    ];
  },

  renderText({ node }) {
    // FIXME: This doesn't copy the link text right
    return `{{link:${node.attrs.url}:${node.attrs.text}:${node.attrs.icon}}}`;
  },
});

export const SmartLinkComponent = memo(
  ({ node }: NodeViewProps) => {
    const { url, text, icon } = node.attrs;

    return (
      <NodeViewWrapper as="span">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onMouseUp={(e) => {
            // Stop tiptap from opening this link twice
            e.stopPropagation();
          }}
          className={styles.smartLink}
        >
          <span className={styles.smartLinkInner}>
            <Icon name={icon} className={styles.icon} />
            {text}
          </span>
        </a>
      </NodeViewWrapper>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function to prevent re-renders
    // Only re-render if these specific props change
    return (
      prevProps.node.attrs.entityId === nextProps.node.attrs.entityId &&
      prevProps.node.attrs.model === nextProps.node.attrs.model &&
      prevProps.selected === nextProps.selected
    );
  },
);

SmartLinkComponent.displayName = "SmartLinkComponent";
