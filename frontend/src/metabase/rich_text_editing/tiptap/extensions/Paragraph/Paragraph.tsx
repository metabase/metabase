import type { NodeViewProps } from "@tiptap/core";
import { Paragraph } from "@tiptap/extension-paragraph";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";

import { CommentsMenu } from "metabase/documents/components/Editor/CommentsMenu";
import { useBlockMenus } from "metabase/documents/hooks/use-block-menus";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import S from "../extensions.module.css";

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

export const ParagraphNodeView = ({
  node,
  editor,
  getPos,
  extension,
}: NodeViewProps) => {
  const editorContext = extension?.options?.editorContext || "document";
  const hideMenusInContext = editorContext === "comments";

  const {
    _id,
    isOpen,
    isHovered,
    hovered,
    setHovered,
    threads,
    document,
    shouldShowMenus,
    setReferenceElement,
    commentsRefs,
    commentsFloatingStyles,
  } = useBlockMenus({
    node,
    editor,
    getPos,
    shouldHideMenus: hideMenusInContext,
  });

  return (
    <>
      <NodeViewWrapper
        aria-expanded={isOpen}
        className={cx(S.root, {
          [S.open]: isOpen || isHovered,
        })}
        data-node-id={_id}
        ref={setReferenceElement}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent<"p"> as="p" />
      </NodeViewWrapper>

      {shouldShowMenus && document && (
        <CommentsMenu
          active={isOpen}
          href={`/document/${document.id}/comments/${_id}`}
          ref={commentsRefs.setFloating}
          show={isOpen || hovered}
          style={commentsFloatingStyles}
          threads={threads}
        />
      )}
    </>
  );
};
