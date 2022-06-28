import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";

export const LogoRoot = styled.div`
  position: relative;
`;

export interface LogoLinkProps {
  isLogoActive?: boolean;
}

export const LogoLink = styled(Link)<LogoLinkProps>`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  padding: 0.5rem 1rem;
  transition: opacity 0.3s;
  pointer-events: ${props => (props.isLogoActive ? "" : "none")};

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const SidebarButton = styled.button`
  cursor: pointer;
  display: block;
`;

export const SidebarIcon = styled(Icon)`
  color: ${color("brand")};
  display: block;
`;
