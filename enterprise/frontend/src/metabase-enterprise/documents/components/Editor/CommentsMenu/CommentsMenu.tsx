// our Portal in metabase/ui does not work here, so we're using the originnal Mantine one
import { Portal } from "@mantine/core";
import cx from "classnames";
import { type CSSProperties, forwardRef } from "react";
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
          [S.visible]: hasComments || show,
        })}
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
          {...(disabled ? undefined : { component: Link, to: href })}
        >
          {hasComments
            ? t`Comments (${threads.flat().length})`
            : t`Add comment`}
        </Button>
      </Box>
    </Portal>
  );
});
