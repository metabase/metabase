import { autoUpdate, useFloating } from "@floating-ui/react";
import type { NodeViewProps } from "@tiptap/core";
import { Paragraph } from "@tiptap/extension-paragraph";
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
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

import S from "./Paragraph.module.css";

export const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ParagraphNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(Paragraph.name)];
  },
});

export const ParagraphNodeView = ({ node, editor, getPos }: NodeViewProps) => {
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
        className={cx(S.paragraph, {
          [S.open]: isOpen,
        })}
        ref={refs.setReference}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent<"p"> as="p" />
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
