import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

export const LogoRoot = styled.div`
  display: flex;
  align-items: center;
  column-gap: 0.5rem;
  padding: 0 0.5rem;
`;

interface LogoLinkProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
}

export const LogoLink = styled(Link)<LogoLinkProps>`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  transition: opacity 0.3s;
  width: 2.5rem;
  height: 2.5rem;

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

interface ToggleContainerProps {
  isLogoVisible?: boolean;
}

export const ToggleContainer = styled.div<ToggleContainerProps>``;
