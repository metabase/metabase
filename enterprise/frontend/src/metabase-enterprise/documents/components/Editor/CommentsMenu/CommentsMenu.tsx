import cx from "classnames";
import { type CSSProperties, forwardRef, useMemo } from "react";
import { createPortal } from "react-dom";

import { Box, Button, type ButtonProps, rem } from "metabase/ui";
import type { CommentThread } from "metabase-enterprise/comments/types";

import { useCommentsButton } from "../hooks/useCommentsButton";

import S from "./CommentsMenu.module.css";

interface Props {
  active: boolean;
  disabled: boolean;
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
  function CommentsMenu(
    { active, disabled, href, show, style, threads }: Props,
    ref,
  ) {
    const unresolvedCommentsCount = useMemo(
      () => getUnresolvedComments(threads).length,
      [threads],
    );
    const commentsButtonProps = useCommentsButton({
      active,
      disabled,
      href,
      unresolvedCommentsCount,
    });
    const hasUnresolvedComments = unresolvedCommentsCount > 0;

    return createPortal(
      <Box
        className={cx(S.commentsMenu, {
          [S.visible]: disabled
            ? hasUnresolvedComments
            : show || hasUnresolvedComments,
        })}
        contentEditable={false}
        draggable={false}
        mt={rem(-2)}
        pl="lg"
        ref={ref}
        style={style}
      >
        <Button {...(commentsButtonProps as ButtonProps)} />
      </Box>,
      document.body,
    );
  },
);
