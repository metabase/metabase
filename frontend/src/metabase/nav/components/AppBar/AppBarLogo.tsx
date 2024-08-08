import type { MouseEvent } from "react";

import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import LogoIcon from "metabase/components/LogoIcon";

import { LogoLink } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isSmallAppBar?: boolean;
  isLogoVisible?: boolean;
  isNavBarEnabled?: boolean;
  onLogoClick?: () => void;
}

export function AppBarLogo({
  isLogoVisible,
  isSmallAppBar,
  isNavBarEnabled,
  onLogoClick,
}: AppBarLogoProps): JSX.Element | null {
  const isAtHomepageDashboard = useIsAtHomepageDashboard();

  if (!isLogoVisible) {
    return null;
  }

  const handleClick = (event: MouseEvent) => {
    // Prevent navigating to the dashboard homepage when a user is already there
    // https://github.com/metabase/metabase/issues/43800
    if (isAtHomepageDashboard) {
      event.preventDefault();
    }
    onLogoClick?.();
  };

  return (
    <LogoLink
      to="/"
      isSmallAppBar={Boolean(isSmallAppBar)}
      onClick={handleClick}
      disabled={!isNavBarEnabled}
      data-testid="main-logo-link"
    >
      <LogoIcon height={32} />
    </LogoLink>
  );
}
