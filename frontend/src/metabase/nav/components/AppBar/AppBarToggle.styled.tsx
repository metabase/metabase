import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";
import { AppBarLeftContainer } from "./AppBarLarge.styled";

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

  ${({ isSmallAppBar }) =>
    isSmallAppBar
      ? css`
          border-radius: 6px;
          padding: 0.5rem 0;
        `
      : css`
          padding: 1rem 0;
        `}

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

  ${props =>
    !props.isLogoVisible &&
    css`
      color: ${color("text-medium")};

      &:hover {
        color: ${color("brand")};
      }
    `}
`;
