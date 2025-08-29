import cx from "classnames";
import { type CSSProperties, forwardRef } from "react";
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

export const CommentsMenu = forwardRef(function CommentsMenu(
  { active, disabled, href, show, style, threads }: Props,
  ref,
) {
  const hasComments = threads.length > 0;

  return (
    <Portal>
      <Box
        className={cx(S.commentsMenu, {
          [S.visible]: disabled ? hasComments : show || hasComments,
        })}
        contentEditable={false}
        draggable={false}
        mt={rem(-2)}
        pr="lg"
        ref={ref}
        style={style}
      >
        <Button
          disabled={disabled}
          leftSection={<Icon name="message" />}
          px="sm"
          size="xs"
          variant={active ? "filled" : "default"}
          {...(disabled
            ? undefined
            : {
                component: Link,
                // If no existing comments, add query param to auto-open new comment form
                to: threads.length === 0 ? `${href}?new=true` : href,
              })}
        >
          {(() => {
            const unresolvedCount = threads
              .flatMap((thread) => thread.comments)
              .filter((comment) => !comment.is_resolved).length;
            return unresolvedCount > 0 ? t`${unresolvedCount}` : "";
          })()}
        </Button>
      </Box>
    </Portal>
  );
});
