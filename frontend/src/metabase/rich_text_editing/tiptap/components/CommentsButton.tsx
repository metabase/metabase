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
  // TODO: replace with ActionIcon (GDGT-2457)
  return (
    <Button
      aria-label={t`Comments`}
      variant={active ? "filled" : "transparent"}
      size={active ? "sm" : "compact-md"}
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
