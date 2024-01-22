import LogoIcon from "metabase/components/LogoIcon";
import { LogoLink } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isSmallAppBar?: boolean;
  isLogoVisible?: boolean;
  onLogoClick?: () => void;
}

export function AppBarLogo({
  isLogoVisible,
  isSmallAppBar,
  onLogoClick,
}: AppBarLogoProps): JSX.Element | null {
  if (!isLogoVisible) {
    return null;
  }

  return (
    <LogoLink
      to="/"
      isSmallAppBar={Boolean(isSmallAppBar)}
      onClick={onLogoClick}
      data-metabase-event="Navbar;Logo"
      data-testid="main-logo-link"
    >
      <LogoIcon height={32} />
    </LogoLink>
  );
}
