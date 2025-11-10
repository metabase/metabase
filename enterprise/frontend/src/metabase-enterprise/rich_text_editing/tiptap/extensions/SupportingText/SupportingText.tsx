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
import cx from "classnames";
import { t } from "ttag";

import S from "./SupportingText.module.css";

export const SupportingText = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: "supportingText",
  group: "block",
  content: "(paragraph|heading|bulletList|orderedList|blockquote|codeBlock)+",
  draggable: true,
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
      // Select all the text inside a SupportingText block if the user pressed cmd/ctrl+a inside one
      "mod-a": ({ editor }) => {
        const match = findParentNode((n) => n.type.name === this.name)(
          editor.state.selection,
        );
        if (match) {
          const from = match.pos + 2;
          const to = match.pos + match.node.nodeSize - 2;
          editor.commands.setTextSelection({ from, to });
          return true;
        }
        return false;
      },

      // Remove this SupportingText block if the user hit Backspace and there was nothing in it
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) {
          return false;
        }
        const match = findParentNode((n) => n.type === this.type)(selection);
        if (!match) {
          return false;
        }
        if (isNodeEmpty(match.node)) {
          editor
            .chain()
            .setNodeSelection(match.pos)
            .deleteSelection()
            .focus(match.pos)
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
  return node.content.content.length === 1 && !firstChild.content.size;
};

const SupportingTextComponent = ({
  deleteNode,
  editor,
  getPos,
  node,
  selected,
}: NodeViewProps) => {
  return (
    <NodeViewWrapper className={cx(S.wrapper, { [S.selected]: selected })}>
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
        onClick={() => {
          const pos = getPos();
          pos && editor.commands.setNodeSelection(pos);
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
