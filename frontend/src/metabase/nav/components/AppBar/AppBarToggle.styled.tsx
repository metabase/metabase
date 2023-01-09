import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

interface SidebarButtonProps {
  isLogoVisible: boolean;
}

export const SidebarButton = styled.button<SidebarButtonProps>`
  cursor: pointer;
  display: block;

  && {
    opacity: ${props => !props.isLogoVisible && 1};
  }
`;

interface SidebarIconProps {
  isLogoVisible: boolean;
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
