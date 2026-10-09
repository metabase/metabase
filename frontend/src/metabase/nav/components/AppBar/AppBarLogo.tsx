import cx from "classnames";
import type { MouseEvent } from "react";

import { Link } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";

import S from "./AppBar.module.css";

export interface AppBarLogoProps {
  isSmallAppBar?: boolean;
  isLogoVisible?: boolean;
  isNavBarEnabled?: boolean;
  isGitSyncVisible?: boolean;
  onLogoClick?: () => void;
}

export function AppBarLogo({
  isLogoVisible,
  isSmallAppBar,
  isNavBarEnabled,
  isGitSyncVisible,
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
    <Link
      to="/"
      className={cx(S.logoLink, {
        [S.logoLinkSpaced]: !isSmallAppBar && !isGitSyncVisible,
        [S.logoLinkSpacedGitSync]: !isSmallAppBar && isGitSyncVisible,
      })}
      onClick={handleClick}
      disabled={!isNavBarEnabled}
      data-testid="main-logo-link"
    >
      <LogoIcon height={32} />
    </Link>
  );
}
