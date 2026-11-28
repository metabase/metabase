import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import { isMac } from "metabase/utils/browser";

type NavToggleActionIconProps = {
  isNavbarOpen: boolean;
  onToggle: () => void;
};

/** PROTOTYPE: the "No top nav" variant's sidebar open/close button. */
export function NavToggleActionIcon({
  isNavbarOpen,
  onToggle,
}: NavToggleActionIconProps) {
  const message = isNavbarOpen ? t`Close sidebar` : t`Open sidebar`;
  const label = `${message} ([ ${t`or`} ${isMac() ? "⌘" : "Ctrl"} + .)`;

  return (
    <Tooltip label={label} openDelay={1000}>
      <ActionIcon
        variant="subtle"
        aria-label={label}
        data-testid="sidebar-toggle"
        onClick={onToggle}
      >
        <Icon name={isNavbarOpen ? "sidebar_closed" : "sidebar_open"} />
      </ActionIcon>
    </Tooltip>
  );
}
