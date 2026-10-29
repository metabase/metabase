import type { ComponentPropsWithoutRef, ElementType } from "react";
import { t } from "ttag";

import { Button, type ButtonProps, Icon } from "metabase/ui";

type Props<C extends ElementType = "button"> = ButtonProps & {
  unresolvedCommentsCount: number;
  active?: boolean;
  component?: C;
} & Omit<ComponentPropsWithoutRef<C>, keyof ButtonProps | "component">;

export const CommentsButton = <C extends ElementType = "button">({
  unresolvedCommentsCount,
  active,
  ...props
}: Props<C>) => {
  return (
    <Button
      aria-label={t`Comments`}
      variant={active ? "filled" : "subtle"}
      color={active ? undefined : "neutral"}
      size="sm"
      leftSection={
        <Icon
          name={unresolvedCommentsCount > 0 ? "comment" : "add_comment"}
          c={active ? undefined : "icon-primary"}
        />
      }
      // Unjustified type cast. FIXME
      {...(props as ButtonProps)}
    >
      {unresolvedCommentsCount > 0 ? unresolvedCommentsCount : null}
    </Button>
  );
};
