import { autoUpdate, useFloating } from "@floating-ui/react";
import type { NodeViewProps } from "@tiptap/core";
import { OrderedList } from "@tiptap/extension-ordered-list";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { useListCommentsQuery } from "metabase-enterprise/api";
import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import {
  getChildTargetId,
  getCurrentDocument,
  getHasUnsavedChanges,
} from "metabase-enterprise/documents/selectors";
import { getListCommentsQuery } from "metabase-enterprise/documents/utils/api";
import { isTopLevel } from "metabase-enterprise/documents/utils/editorNodeUtils";

import { CommentsMenu } from "../../CommentsMenu";
import S from "../../shared/Comments.module.css";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

export const CustomOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          return element.hasAttribute("start")
            ? parseInt(element.getAttribute("start") || "", 10)
            : 1;
        },
      },
      type: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("type"),
      },
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(OrderedListNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(OrderedList.name)];
  },
});

export const OrderedListNodeView = ({
  node,
  editor,
  getPos,
}: NodeViewProps) => {
  const childTargetId = useSelector(getChildTargetId);
  const document = useSelector(getCurrentDocument);
  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(document),
  );
  const comments = commentsData?.comments;
  const hasUnsavedChanges = useSelector(getHasUnsavedChanges);
  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const { _id } = node.attrs;
  const isOpen = childTargetId === _id;
  const threads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );
  const { refs, floatingStyles } = useFloating({
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    strategy: "fixed",
    open: rendered,
  });

  useEffect(() => {
    if (!rendered) {
      setRendered(true);
    }
  }, [rendered]);

  return (
    <>
      <NodeViewWrapper
        className={cx(S.root, {
          [S.open]: isOpen,
        })}
        ref={refs.setReference}
        // onMouseEnter/onMouseLeave do not work on list elements living in contentEditable
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent<"ol"> as="ol" />
      </NodeViewWrapper>

      {document && rendered && isTopLevel({ editor, getPos }) && (
        <CommentsMenu
          active={isOpen}
          disabled={hasUnsavedChanges}
          href={`/document/${document.id}/comments/${_id}`}
          ref={refs.setFloating}
          show={isOpen || hovered}
          threads={threads}
          style={floatingStyles}
        />
      )}
    </>
  );
};
