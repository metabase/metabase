import type { MouseEvent } from "react";

import { Link } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { Flex, rem } from "metabase/ui";

import S from "./AppBarLogo.module.css";

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
      className={S.logoLink}
      onClick={handleClick}
      disabled={!isNavBarEnabled}
      data-testid="main-logo-link"
    >
      <Flex
        align="center"
        justify="center"
        h={rem(52)}
        miw={rem(36)}
        maw="14rem"
        lh={0}
        mr={!isSmallAppBar ? (isGitSyncVisible ? "md" : "xl") : undefined}
      >
        <LogoIcon height={32} />
      </Flex>
    </Link>
  );
}
