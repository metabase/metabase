import cx from "classnames";
import {
  type CSSProperties,
  type ElementType,
  forwardRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, type ButtonProps, Icon, rem } from "metabase/ui";
import type { CommentThread } from "metabase-enterprise/comments/types";

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

interface CommentsButtonOptions {
  active: boolean;
  disabled: boolean;
  href: string;
  unresolvedCommentsCount: number;
}

export const useCommentsButton = ({
  active,
  disabled,
  href,
  unresolvedCommentsCount,
}: CommentsButtonOptions): ButtonProps & {
  component?: ElementType;
  to?: string;
} => {
  const hasUnresolvedComments = unresolvedCommentsCount > 0;
  return {
    ...(!disabled
      ? {
          component: Link,
          // If no existing unresolved comments comments, add query param to auto-open new comment form
          to: hasUnresolvedComments ? href : `${href}?new=true`,
        }
      : {}),
    disabled,
    leftSection: (
      <Icon name={hasUnresolvedComments ? "comment" : "add_comment"} />
    ),
    px: "sm",
    size: "xs",
    bd: 0,
    "aria-label": t`Comments`,
    variant: active ? "filled" : "default",
    children: hasUnresolvedComments ? unresolvedCommentsCount : null,
  };
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
