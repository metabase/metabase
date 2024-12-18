import React, { type Ref, forwardRef } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { Menu } from "metabase/ui";

// TODO: rename to notifications
export function SharingMenu({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip?: string;
}) {
  const hasNoChildren = !children || !React.Children.count(children);

  return (
    <Menu withinPortal position="bottom-end">
      <Menu.Target>
        <ToolbarButton
          icon="alert"
          data-testid="notifications-menu-button"
          tooltipLabel={tooltip ?? t`Notifications`}
          aria-label={tooltip ?? t`Notifications`}
          disabled={hasNoChildren}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="notifications-menu">{children}</Menu.Dropdown>
    </Menu>
  );
}

export const SharingButton = forwardRef(function _SharingButton(
  {
    tooltip,
    onClick,
    disabled,
  }: {
    tooltip?: string;
    onClick?: () => void;
    disabled?: boolean;
  },
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <ToolbarButton
      ref={ref}
      icon="share"
      data-testid="notifications-menu-button"
      tooltipLabel={tooltip ?? t`Sharing`}
      aria-label={tooltip ?? t`Sharing`}
      onClick={onClick}
      disabled={disabled}
    />
  );
});
