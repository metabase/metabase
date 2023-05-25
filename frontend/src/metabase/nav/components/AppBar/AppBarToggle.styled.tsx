import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { AppBarLeftContainer } from "./AppBarLarge.styled";

interface SidebarButtonProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
}

export const SidebarButton = styled.button<SidebarButtonProps>`
  cursor: pointer;
  display: block;

  ${({ isNavBarEnabled, isLogoVisible, isSmallAppBar }) =>
    isLogoVisible && !isSmallAppBar
      ? css`
          opacity: ${isNavBarEnabled ? 0 : 1};

          ${AppBarLeftContainer}:hover & {
            opacity: ${isNavBarEnabled ? 1 : 0};
          }
        `
      : css`
          opacity: 1;
        `}
`;

interface SidebarIconProps {
  isLogoVisible?: boolean;
}

export const SidebarIcon = styled(Icon)<SidebarIconProps>`
  color: ${color("brand")};
  display: block;
  transform: translateY(2px) translateX(2px);

  ${props =>
    !props.isLogoVisible &&
    css`
      color: ${color("text-medium")};

      &:hover {
        color: ${color("brand")};
      }
    `}
`;
