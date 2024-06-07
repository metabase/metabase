import type { MouseEvent } from "react";
import { useLocation } from "react-use";

import LogoIcon from "metabase/components/LogoIcon";
import { useSelector } from "metabase/lib/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";

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
  const location = useLocation();
  const homepageDashboardId = useSelector(getCustomHomePageDashboardId);

  if (!isLogoVisible) {
    return null;
  }

  const isAtDashboardHomepage = Boolean(
    homepageDashboardId &&
      location.pathname?.startsWith(`/dashboard/${homepageDashboardId}`),
  );

  const handleClick = (event: MouseEvent) => {
    // Prevent navigating to the dashboard homepage when a user is already there
    // https://github.com/metabase/metabase/issues/43800
    if (isAtDashboardHomepage) {
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
