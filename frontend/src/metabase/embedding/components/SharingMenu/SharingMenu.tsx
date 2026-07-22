import React from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { Menu } from "metabase/ui";

export function SharingMenu({ children }: { children: React.ReactNode }) {
  const hasNoChildren = !children || !React.Children.count(children);

  return (
    <Menu withinPortal position="bottom-end">
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

export function SharingButton({
  tooltip,
  "aria-label": ariaLabel,
  onClick,
}: {
  tooltip?: React.ReactNode;
  "aria-label"?: string;
  onClick?: () => void;
}) {
  return (
    <ToolbarButton
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
}
