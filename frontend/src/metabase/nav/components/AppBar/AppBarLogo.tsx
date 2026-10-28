import type { JSX, MouseEvent } from "react";

import { Link } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";

import S from "./AppBar.module.css";

export interface AppBarLogoProps {
  isLogoVisible?: boolean;
  isNavBarEnabled?: boolean;
}

export function AppBarLogo({
  isLogoVisible,
  isNavBarEnabled,
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
  };

  return (
    <Link
      to="/"
      className={S.logoLink}
      onClick={handleClick}
      disabled={!isNavBarEnabled}
      data-testid="main-logo-link"
    >
      <LogoIcon height={32} />
    </Link>
  );
}
