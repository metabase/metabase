import { autoUpdate, useFloating } from "@floating-ui/react";
import type { NodeViewProps } from "@tiptap/core";
import { BulletList } from "@tiptap/extension-bullet-list";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import { useDocumentContext } from "metabase-enterprise/documents/components/DocumentContext";
import { isTopLevel } from "metabase-enterprise/documents/utils/editorNodeUtils";

import { CommentsMenu } from "../../CommentsMenu";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

import S from "./BulletList.module.css";

export const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BulletListNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(BulletList.name)];
  },
});

export const BulletListNodeView = ({ node, editor, getPos }: NodeViewProps) => {
  const { childTargetId, comments, document, hasUnsavedChanges } =
    useDocumentContext();
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
        className={cx(S.bulletList, {
          [S.open]: isOpen,
        })}
        ref={refs.setReference}
        // onMouseEnter/onMouseLeave do not work on list elements living in contentEditable
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent as="ul" />
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
