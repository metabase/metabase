import { NodeViewWrapper } from "@tiptap/react";
import cx from "classnames";

import S from "metabase/rich_text_editing/tiptap/extensions/extensions.module.css";
import type { BlockShellProps } from "metabase/rich_text_editing/tiptap/extensions/shared/BlockShell";

import { useBlockMenus } from "../../hooks/use-block-menus";

import { AnchorLinkMenu } from "./AnchorLinkMenu";
import { CommentsMenu } from "./CommentsMenu";

/**
 * Document-specific block shell injected into the editor's block node views.
 * Wraps the block content and adds the comment menu (and, for headings, the
 * anchor-link menu) driven by the document's comment state.
 */
export const DocumentBlockShell = ({
  node,
  editor,
  getPos,
  hideMenus,
  children,
}: BlockShellProps) => {
  const {
    _id,
    isOpen,
    isHovered,
    hovered,
    setHovered,
    unresolvedCommentsCount,
    document,
    shouldShowMenus,
    anchorUrl,
    setReferenceElement,
    commentsRefs,
    commentsFloatingStyles,
    anchorRefs,
    anchorFloatingStyles,
  } = useBlockMenus({ node, editor, getPos, shouldHideMenus: hideMenus });

  const isHeading = node.type.name === "heading";

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
        {children}
      </NodeViewWrapper>

      {shouldShowMenus && document && (
        <>
          {isHeading && (
            <AnchorLinkMenu
              ref={anchorRefs.setFloating}
              show={hovered}
              style={anchorFloatingStyles}
              url={anchorUrl}
            />
          )}
          <CommentsMenu
            active={isOpen}
            href={`/document/${document.id}/comments/${_id}`}
            ref={commentsRefs.setFloating}
            show={isOpen || hovered}
            style={commentsFloatingStyles}
            unresolvedCommentsCount={unresolvedCommentsCount}
          />
        </>
      )}
    </>
  );
};
