import cx from "classnames";
import { type CSSProperties, forwardRef, useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

// our Portal in metabase/ui does not work here, so we're using the originnal Mantine one
import { Box, Button, Icon, Portal, rem } from "metabase/ui";
import type { CommentThread } from "metabase-enterprise/comments/types";

import S from "./CommentsMenu.module.css";

interface Props {
  active: boolean;
  disabled: boolean;
  href: string;
  show: boolean;
  threads: CommentThread[];
  style: CSSProperties;
}

export const CommentsMenu = forwardRef<HTMLDivElement, Props>(
  function CommentsMenu(
    { active, disabled, href, show, style, threads }: Props,
    ref,
  ) {
    const unresolvedCommentsCount = useMemo(
      () =>
        threads
          .flatMap((thread) => thread.comments)
          .filter((comment) => !comment.is_resolved).length,
      [threads],
    );
    const hasUnresolvedComments = unresolvedCommentsCount > 0;

    return (
      <Portal>
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
              // If no existing comments, add query param to auto-open new comment form
              to={threads.length === 0 ? `${href}?new=true` : href}
              leftSection={<Icon name="message" />}
              px="sm"
              size="xs"
              aria-label={t`Comments`}
              variant={active ? "filled" : "default"}
            >
              {unresolvedCommentsCount > 0 ? unresolvedCommentsCount : null}
            </Button>
          )}
        </Box>
      </Portal>
    );
  },
);
