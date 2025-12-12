import cx from "classnames";
import { type CSSProperties, forwardRef, useMemo } from "react";
import { createPortal } from "react-dom";

import type { CommentThread } from "metabase/comments/types";
import { ForwardRefLink } from "metabase/common/components/Link";
import { CommentsButton } from "metabase/rich_text_editing/tiptap/components/CommentsButton";
import { Box, rem } from "metabase/ui";

import S from "./CommentsMenu.module.css";

interface Props {
  active: boolean;
  disabled?: boolean;
  href: string;
  show: boolean;
  style: CSSProperties;
  threads: CommentThread[];
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
  function CommentsMenu({ active, href, show, style, threads }: Props, ref) {
    const unresolvedCommentsCount = useMemo(
      () => getUnresolvedComments(threads).length,
      [threads],
    );
    const hasUnresolvedComments = unresolvedCommentsCount > 0;

    return createPortal(
      <Box
        className={cx(S.commentsMenu, {
          [S.visible]: show || hasUnresolvedComments,
        })}
        contentEditable={false}
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
          to={unresolvedCommentsCount > 0 ? href : `${href}?new=true`}
        />
      </Box>,
      document.body,
    );
  },
);
