import { forwardRef } from "react";

import { ActionIcon, type ActionIconProps, Icon } from "metabase/ui";

type MoreMenuButtonProps = Omit<
  ActionIconProps,
  "variant" | "size" | "children"
> & {
  "aria-label": string;
};

export const MoreMenuButton = forwardRef<
  HTMLButtonElement,
  MoreMenuButtonProps
>(function MoreMenuButton(props, ref) {
  return (
    <ActionIcon ref={ref} variant="subtle" size="md" {...props}>
      <Icon name="ellipsis" />
    </ActionIcon>
  );
});
