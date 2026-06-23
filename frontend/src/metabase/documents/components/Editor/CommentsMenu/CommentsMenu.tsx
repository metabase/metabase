import cx from "classnames";
import { type CSSProperties, forwardRef } from "react";
import { createPortal } from "react-dom";

import type { CommentThread } from "metabase/comments/types";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useCommentUrl } from "metabase/documents/hooks/use-comment-url";
import { CommentsButton } from "metabase/rich_text_editing/tiptap/components/CommentsButton";
import { Box, rem } from "metabase/ui";
import type { EntityId } from "metabase-types/api/comments";

import S from "./CommentsMenu.module.css";

interface Props {
  active: boolean;
  disabled?: boolean;
  childTargetId: EntityId;
  show: boolean;
  style: CSSProperties;
  unresolvedCommentsCount: number;
}

export const getUnresolvedComments = (
  threads: CommentThread[],
): CommentThread["comments"] => {
  return threads
    .filter((thread) => !thread.comments[0]?.is_resolved)
    .flatMap((thread) =>
      thread.comments.filter((comment) => !comment.deleted_at),
    );
};

export const CommentsMenu = forwardRef<HTMLDivElement, Props>(
  function CommentsMenu(
    { active, childTargetId, show, style, unresolvedCommentsCount }: Props,
    ref,
  ) {
    const hasUnresolvedComments = unresolvedCommentsCount > 0;
    const commentUrl = useCommentUrl({
      childTargetId,
      searchParams: hasUnresolvedComments ? undefined : { new: "true" },
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
        pl="lg"
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
