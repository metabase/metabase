import type { ComponentPropsWithoutRef, ElementType } from "react";
import { t } from "ttag";

import { Button, type ButtonProps, Icon } from "metabase/ui";

type Props<C extends ElementType = "button"> = ButtonProps & {
  unresolvedCommentsCount: number;
  component?: C;
} & Omit<ComponentPropsWithoutRef<C>, keyof ButtonProps | "component">;

export const CommentsButton = <C extends ElementType = "button">({
  unresolvedCommentsCount,
  ...props
}: Props<C>) => {
  return (
    <Button
      aria-label={t`Comments`}
      bd={0}
      leftSection={
        <Icon name={unresolvedCommentsCount > 0 ? "comment" : "add_comment"} />
      }
      px="sm"
      size="xs"
      {...(props as ButtonProps)}
    >
      {unresolvedCommentsCount > 0 ? unresolvedCommentsCount : null}
    </Button>
  );
};
