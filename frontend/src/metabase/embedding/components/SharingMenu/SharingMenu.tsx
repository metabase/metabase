import React, { createContext, useCallback, useContext, useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { Group, Menu } from "metabase/ui";

const SharingMenuCloseContext = createContext<() => void>(() => {});

// Buttons in the actions row aren't Menu.Items, so they close the popover through this.
export function useCloseSharingMenu() {
  return useContext(SharingMenuCloseContext);
}

export function SharingMenu({
  actions,
  children,
}: {
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const closeMenu = useCallback(() => setOpened(false), []);

  const hasActions = React.Children.toArray(actions).length > 0;
  const hasMenuItems = React.Children.toArray(children).length > 0;

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      withinPortal
      position="bottom-end"
    >
      <Menu.Target>
        <ToolbarButton
          icon="share"
          data-testid="sharing-menu-button"
          tooltipLabel={t`Share`}
          aria-label={t`Share`}
          disabled={!hasActions && !hasMenuItems}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="sharing-menu">
        <SharingMenuCloseContext.Provider value={closeMenu}>
          {hasActions && (
            <Group gap="md" p="sm" grow wrap="nowrap">
              {actions}
            </Group>
          )}
          {/* mx cancels the 0.75rem dropdown padding so the divider runs edge to edge;
              mt mirrors it so the buttons get the same gap below as above */}
          {hasActions && hasMenuItems && (
            <Menu.Divider mx="-0.75rem" mt="0.75rem" />
          )}
          {children}
        </SharingMenuCloseContext.Provider>
      </Menu.Dropdown>
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
