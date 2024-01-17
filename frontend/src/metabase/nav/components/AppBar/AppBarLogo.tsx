import LogoIcon from "metabase/components/LogoIcon";
import { LogoLink } from "./AppBarLogo.styled";

export interface AppBarLogoProps {
  onLogoClick?: () => void;
}

export function AppBarLogo({ onLogoClick }: AppBarLogoProps): JSX.Element {
  return (
    <LogoLink to="/" onClick={onLogoClick} data-metabase-event="Navbar;Logo">
      <LogoIcon height={32} />
    </LogoLink>
  );
}
