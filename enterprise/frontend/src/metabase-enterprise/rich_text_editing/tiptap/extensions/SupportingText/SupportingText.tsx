import {
  Node,
  type NodeViewProps,
  findParentNode,
  mergeAttributes,
} from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { t } from "ttag";

import S from "./SupportingText.module.css";

export const SupportingText = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: "supportingText",
  group: "block",
  content: "(paragraph|heading|bulletList|orderedList|blockquote|codeBlock)+",
  draggable: false,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="supportingText"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "supportingText",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SupportingTextComponent);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) {
          return false;
        }
        const parentSupportingText = findParentNode(
          (n) => n.type === this.type,
        )(selection);
        if (!parentSupportingText) {
          return false;
        }
        // Remove this SupportingText block if the user hit Backspace and there was nothing in it
        if (isNodeEmpty(parentSupportingText.node)) {
          editor
            .chain()
            .setNodeSelection(parentSupportingText.pos)
            .deleteSelection()
            .focus(parentSupportingText.pos)
            .run();
          return true;
        }

        return false;
      },
    };
  },
});

const isNodeEmpty = (node: ProseMirrorNode): boolean => {
  const [firstChild] = node.content.content;
  return (
    node.content.content.length === 1 &&
    firstChild?.type.name === "paragraph" &&
    !firstChild.content.size
  );
};

const SupportingTextComponent = ({
  deleteNode,
  editor,
  getPos,
  node,
}: NodeViewProps) => {
  return (
    <NodeViewWrapper className={S.wrapper}>
      <div className={S.scrollContainer}>
        {isNodeEmpty(node) && (
          <div contentEditable={false} className={S.placeholder}>
            {t`Write whatever you'd like to`}
          </div>
        )}
        <NodeViewContent />
      </div>
      <button
        contentEditable={false}
        aria-label={t`Supporting text`}
        className={S.handle}
        onClick={(e) => {
          e.currentTarget.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            const pos = getPos();
            deleteNode();
            if (pos != null) {
              editor.commands.focus(pos);
            }
          }
        }}
      />
    </NodeViewWrapper>
  );
};
