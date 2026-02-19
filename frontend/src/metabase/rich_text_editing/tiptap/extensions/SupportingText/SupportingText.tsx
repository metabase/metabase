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
import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListCommentsQuery } from "metabase/api/comment";
import { getTargetChildCommentThreads } from "metabase/comments/utils";
import { getUnresolvedComments } from "metabase/documents/components/Editor/CommentsMenu";
import {
  getChildTargetId,
  getCurrentDocument,
} from "metabase/documents/selectors";
import { getListCommentsQuery } from "metabase/documents/utils/api";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch, useSelector } from "metabase/lib/redux/hooks";
import { DropZone } from "metabase/rich_text_editing/tiptap/extensions/shared/dnd/DropZone";
import { useDndHelpers } from "metabase/rich_text_editing/tiptap/extensions/shared/dnd/use-dnd-helpers";
import { Box } from "metabase/ui";

import { CommentsButton } from "../../components/CommentsButton";
import { cleanupFlexContainerNodes } from "../HandleEditorDrop/utils";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

import S from "./SupportingText.module.css";

const SUPPORTING_TEXT_NODE_NAME = "supportingText";

export const SupportingText = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: SUPPORTING_TEXT_NODE_NAME,
  group: "block",
  content: "(paragraph|heading|bulletList|orderedList|blockquote|codeBlock)+",
  draggable: true,
  isolating: true,
  disableDropCursor: true,

  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${SUPPORTING_TEXT_NODE_NAME}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": SUPPORTING_TEXT_NODE_NAME,
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
          cleanupFlexContainerNodes(editor.view);
          return true;
        }

        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(this.name)];
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
  const childTargetId = useSelector(getChildTargetId);
  const document = useSelector(getCurrentDocument);
  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(document),
  );
  const comments = commentsData?.comments;
  const { _id } = node.attrs;
  const isOpen = childTargetId === _id;
  const threads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );
  const unresolvedCommentsCount = useMemo(
    () => getUnresolvedComments(threads).length,
    [threads],
  );
  const commentsPath = document
    ? `/document/${document.id}/comments/${_id}`
    : "";
  const dispatch = useDispatch();

  const canWrite = editor.options.editable;

  const { isBeingDragged, dragState, setDragState, handleDragOver, dragElRef } =
    useDndHelpers({ editor, node, getPos });

  // Disallow cut/copy on the drag-handle/comments-button since that'd cut/copy the block itself (cutting/copying supportingText *content* should be allowed though)
  const onCutOrCopy = (e: ClipboardEvent) => {
    if (window.document.activeElement !== editor.view.dom) {
      e.preventDefault();
    }
  };

  return (
    <NodeViewWrapper
      className={cx(S.wrapper, { [S.selected]: selected })}
      data-testid="document-card-supporting-text"
      data-type={SUPPORTING_TEXT_NODE_NAME}
      onDragOver={handleDragOver}
      onDrop={() => setDragState({ isDraggedOver: false, side: null })}
      onCut={onCutOrCopy}
      onCopy={onCutOrCopy}
    >
      {canWrite && (
        <>
          <DropZone
            isOver={dragState.isDraggedOver && dragState.side === "left"}
            side="left"
            disabled={isBeingDragged}
          />
          <DropZone
            isOver={dragState.isDraggedOver && dragState.side === "right"}
            side="right"
            disabled={isBeingDragged}
          />
        </>
      )}
      <div className={S.scrollContainer}>
        {isNodeEmpty(node) && (
          <div contentEditable={false} className={S.placeholder}>
            {t`Write whatever you'd like to`}
          </div>
        )}
        <NodeViewContent />
      </div>

      {/* Would be nice to use a real `button` here, but that prevents ProseMirror plugin dragstart events from firing */}
      {canWrite && (
        <div
          role="button"
          tabIndex={0}
          data-drag-handle
          ref={dragElRef}
          contentEditable={false}
          aria-label={t`Supporting text`}
          className={S.handle}
          onClick={() => {
            const pos = getPos();
            if (pos) {
              editor.commands.setNodeSelection(pos);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              const pos = getPos();
              deleteNode();
              cleanupFlexContainerNodes(editor.view);
              if (pos != null) {
                editor.commands.focus(pos);
              }
            }
          }}
        />
      )}
      {document && !isWithinIframe() && (
        <Box
          pos="absolute"
          top="0.25rem"
          right="0.25rem"
          className={cx({
            [S.showOnHover]: !isOpen && !unresolvedCommentsCount,
          })}
        >
          <CommentsButton
            className={S.commentsButton}
            disabled={!commentsPath}
            variant={isOpen ? "filled" : "default"}
            unresolvedCommentsCount={unresolvedCommentsCount}
            onClick={(e) => {
              e.preventDefault();
              dispatch(
                push(
                  unresolvedCommentsCount > 0
                    ? commentsPath
                    : `${commentsPath}?new=true`,
                ),
              );
            }}
          />
        </Box>
      )}
    </NodeViewWrapper>
  );
};
