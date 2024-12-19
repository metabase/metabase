import { type ReactNode, type Ref, forwardRef } from "react";

import { Button, type ButtonProps, Icon, type IconName } from "metabase/ui";

export const ToolbarButton = forwardRef(_ToolbarButton);

function _ToolbarButton(
  {
    label,
    icon,
    isHighlighted,
    ...buttonProps
  }: {
    label: ReactNode;
    icon?: IconName;
    isHighlighted?: boolean;
  } & ButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <Button
      ref={ref}
      variant={isHighlighted ? "filled" : "subtle"}
      leftIcon={icon ? <Icon name={icon} /> : undefined}
      py="sm"
      px="md"
      {...buttonProps}
    >
      {label}
    </Button>
  );
}
