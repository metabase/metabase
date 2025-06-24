import { forwardRef } from "react";

import type { IconName } from "embedding-sdk/types/ui";
import { Button, type ButtonProps, Icon } from "metabase/ui";

export const ToolbarButton = forwardRef(_ToolbarButton);

function _ToolbarButton(
  {
    label,
    icon,
    isHighlighted,
    ...buttonProps
  }: {
    label: React.ReactNode;
    icon?: IconName;
    isHighlighted?: boolean;
  } & ButtonProps,
  ref: React.Ref<HTMLButtonElement>,
) {
  return (
    <Button
      ref={ref}
      variant={isHighlighted ? "filled" : "subtle"}
      leftSection={icon ? <Icon name={icon} /> : undefined}
      py="sm"
      px="md"
      {...buttonProps}
    >
      {label}
    </Button>
  );
}
