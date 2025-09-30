import type React from "react";
import { t } from "ttag";

import { Button, type ButtonProps, Icon } from "metabase/ui";

interface Props extends ButtonProps {
  unresolvedCommentsCount: number;
  component?: React.ElementType<any, any>;
  to: string;
}

export const CommentsButton = ({
  unresolvedCommentsCount,
  ...props
}: Props) => {
  return (
    <Button
      aria-label={t`Comments`}
      bd={0}
      leftSection={
        <Icon name={unresolvedCommentsCount > 0 ? "comment" : "add_comment"} />
      }
      px="sm"
      size="xs"
      {...props}
    >
      {unresolvedCommentsCount > 0 ? unresolvedCommentsCount : null}
    </Button>
  );
};
