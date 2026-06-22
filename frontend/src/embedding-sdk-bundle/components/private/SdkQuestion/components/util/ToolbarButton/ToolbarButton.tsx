import { type ReactNode, type Ref, forwardRef } from "react";

import type { IconName } from "metabase/embedding-sdk/types/icon";
import { Button, type ButtonProps, Icon } from "metabase/ui";

export const ToolbarButton = forwardRef(_ToolbarButton);

function _ToolbarButton(
  {
    label,
    icon,
    iconUrl,
    isHighlighted,
    ...buttonProps
  }: {
    label: ReactNode;
    icon?: IconName;
    iconUrl?: string;
    isHighlighted?: boolean;
  } & ButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <Button
      ref={ref}
      variant={isHighlighted ? "filled" : "subtle"}
      leftSection={
        iconUrl ? (
          <img src={iconUrl} alt="" width={16} height={16} />
        ) : icon ? (
          <Icon name={icon} />
        ) : undefined
      }
      py="sm"
      px="md"
      {...buttonProps}
    >
      {label}
    </Button>
  );
}
