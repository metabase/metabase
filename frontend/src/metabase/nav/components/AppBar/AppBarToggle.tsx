import { t } from "ttag";
import { isMac } from "metabase/lib/browser";
import { Tooltip } from "metabase/ui";
import { SidebarButton, SidebarIcon } from "./AppBarToggle.styled";

export interface AppBarToggleProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isNavBarOpen?: boolean;
  onToggleClick?: () => void;
}

export function AppBarToggle({
  isSmallAppBar,
  isNavBarEnabled,
  isLogoVisible,
  isNavBarOpen,
  onToggleClick,
}: AppBarToggleProps): JSX.Element | null {
  if (!isNavBarEnabled) {
    return null;
  }

  return (
    <Tooltip
      label={getSidebarTooltipLabel(isNavBarOpen)}
      disabled={isSmallAppBar}
      withArrow
      offset={-12}
    >
      <SidebarButton
        isSmallAppBar={isSmallAppBar}
        isNavBarEnabled={isNavBarEnabled}
        isLogoVisible={isLogoVisible}
        onClick={onToggleClick}
        data-testid="sidebar-toggle"
        aria-label={t`Toggle sidebar`}
      >
        <SidebarIcon isLogoVisible={isLogoVisible} size={20} name="burger" />
      </SidebarButton>
    </Tooltip>
  );
}

const getSidebarTooltipLabel = (isNavBarOpen?: boolean) => {
  const message = isNavBarOpen ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};
