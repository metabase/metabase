import React, { type Ref, forwardRef } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { Menu, type MenuProps } from "metabase/ui";

// 24px padding + two 120px buttons + 16px gap, per the sharing menu design
export const SHARING_MENU_WIDTH = 304;

export function SharingMenu({
  children,
  ...menuProps
}: {
  children: React.ReactNode;
} & MenuProps) {
  const hasNoChildren = !children || !React.Children.count(children);

  return (
    <Menu withinPortal position="bottom-end" {...menuProps}>
      <Menu.Target>
        <ToolbarButton
          icon="share"
          data-testid="sharing-menu-button"
          tooltipLabel={t`Share`}
          aria-label={t`Share`}
          disabled={hasNoChildren}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="sharing-menu">{children}</Menu.Dropdown>
    </Menu>
  );
}

export const SharingButton = forwardRef(function _SharingButton(
  {
    tooltip,
    "aria-label": ariaLabel,
    onClick,
  }: {
    tooltip?: React.ReactNode;
    "aria-label"?: string;
    onClick?: () => void;
  },
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <ToolbarButton
      ref={ref}
      icon="share"
      data-testid="sharing-menu-button"
      tooltipLabel={tooltip ?? t`Share`}
      // aria-label must be a string; keep the accessible name stable when the
      // tooltip is a non-string node (e.g. the copied-confirmation flash)
      aria-label={
        ariaLabel ?? (typeof tooltip === "string" ? tooltip : t`Share`)
      }
      onClick={onClick}
    />
  );
});
