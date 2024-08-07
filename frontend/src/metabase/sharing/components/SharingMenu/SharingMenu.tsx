import React from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { Menu } from "metabase/ui";

export function SharingMenu({
  children,
}: {
  children: React.ReactNode;
  anchorEl?: React.RefObject<HTMLButtonElement>;
}) {
  if (!children || !React.Children.count(children)) {
    return null;
  }

  return (
    <Menu withinPortal>
      <Menu.Target>
        <ToolbarButton
          icon="share"
          data-testid="sharing-menu-button"
          tooltipLabel={t`Sharing`}
          aria-label={t`Sharing`}
        />
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}
