import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

interface SidebarButtonProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
}

export const SidebarButton = styled.button<SidebarButtonProps>`
  cursor: pointer;
  display: block;
`;

interface SidebarIconProps {
  isLogoVisible?: boolean;
}

export const SidebarIcon = styled(Icon)<SidebarIconProps>`
  color: ${color("text-dark")};
  display: block;
`;
