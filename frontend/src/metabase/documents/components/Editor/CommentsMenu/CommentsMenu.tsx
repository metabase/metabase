import cx from "classnames";
import { type CSSProperties, forwardRef } from "react";
import { createPortal } from "react-dom";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useEditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import { CommentsButton } from "metabase/rich_text_editing/tiptap/components/CommentsButton";
import { Box, rem } from "metabase/ui";

import S from "./CommentsMenu.module.css";

interface Props {
  active: boolean;
  childTargetId: string;
  show: boolean;
  style: CSSProperties;
  unresolvedCommentsCount: number;
}

export const CommentsMenu = forwardRef<HTMLDivElement, Props>(
  function CommentsMenu(
    { active, childTargetId, show, style, unresolvedCommentsCount }: Props,
    ref,
  ) {
    const host = useEditorHost();
    const hasUnresolvedComments = unresolvedCommentsCount > 0;
    const commentUrl = host.useCommentUrl({
      childTargetId,
    });

    return createPortal(
      <Box
        className={cx(S.commentsMenu, {
          [S.visible]: show || hasUnresolvedComments,
        })}
        contentEditable={false}
        data-testid="comments-menu"
        draggable={false}
        mt={rem(-2)}
        ps="xl"
        ref={ref}
        style={style}
      >
        <CommentsButton<typeof ForwardRefLink>
          variant={active ? "filled" : "default"}
          unresolvedCommentsCount={unresolvedCommentsCount}
          component={ForwardRefLink}
          to={commentUrl}
        />
      </Box>,
      document.body,
    );
  },
);
