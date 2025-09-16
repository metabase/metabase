import cx from "classnames";
import { type CSSProperties, forwardRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Icon, rem } from "metabase/ui";
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

export const CommentsMenu = forwardRef<HTMLDivElement, Props>(
  function CommentsMenu(
    { active, disabled, href, show, style, threads }: Props,
    ref,
  ) {
    const unresolvedCommentsCount = useMemo(
      () =>
        threads
          .filter((thread) => !thread.comments[0]?.is_resolved)
          .flatMap((thread) =>
            thread.comments.filter((comment) => !comment.deleted_at),
          ).length,
      [threads],
    );
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
        {disabled ? (
          <Button
            disabled
            leftSection={<Icon name="message" />}
            px="sm"
            size="xs"
            aria-label={t`Comments`}
            variant={active ? "filled" : "default"}
          >
            {unresolvedCommentsCount > 0 ? unresolvedCommentsCount : null}
          </Button>
        ) : (
          <Button
            component={Link}
            // If no existing unresolved comments comments, add query param to auto-open new comment form
            to={hasUnresolvedComments ? href : `${href}?new=true`}
            leftSection={<Icon name="message" />}
            px="sm"
            size="xs"
            aria-label={t`Comments`}
            variant={active ? "filled" : "default"}
          >
            {unresolvedCommentsCount > 0 ? unresolvedCommentsCount : null}
          </Button>
        )}
      </Box>,
      document.body,
    );
  },
);
