import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

interface SidebarButtonProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
}

export const SidebarButton = styled.button<SidebarButtonProps>`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  padding: ${({ isSmallAppBar }) => (isSmallAppBar ? `0.5rem 0` : `1rem 0`)};
`;

interface SidebarIconProps {
  isLogoVisible?: boolean;
}

export const SidebarIcon = styled(Icon)<SidebarIconProps>`
  color: ${color("brand")};
  display: block;

  ${props =>
    !props.isLogoVisible &&
    css`
      color: ${color("text-medium")};

      &:hover {
        color: ${color("brand")};
      }
    `}
`;
