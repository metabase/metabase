import { css } from "@emotion/react";
import styled from "@emotion/styled";

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
  color: var(--mb-color-brand);
  display: block;

  ${props =>
    !props.isLogoVisible &&
    css`
      color: var(--mb-color-text-medium);

      &:hover {
        color: var(--mb-color-brand);
      }
    `}
`;
