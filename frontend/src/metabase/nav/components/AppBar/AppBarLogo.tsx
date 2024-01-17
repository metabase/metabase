import LogoIcon from "metabase/components/LogoIcon";
import { LogoLink } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  isLogoVisible?: boolean;
  onLogoClick?: () => void;
}

export function AppBarLogo({
  isLogoVisible,
  onLogoClick,
}: AppBarLogoProps): JSX.Element | null {
  if (!isLogoVisible) {
    return null;
  }

  return (
    <LogoLink to="/" onClick={onLogoClick} data-metabase-event="Navbar;Logo">
      <LogoIcon height={32} />
    </LogoLink>
  );
}
