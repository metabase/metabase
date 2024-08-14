import styled from "@emotion/styled";
import { Link } from "react-router";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export interface MenuItemProps {
  disabled?: boolean;
}

export const MenuItemContent = styled.div<MenuItemProps>`
  display: flex;
  align-items: center;
  border-radius: 0.5em;
  cursor: ${props => (props.disabled ? "not-allowed" : "pointer")};
  color: ${props => color(props.disabled ? "text-light" : "text-dark")};
  padding: 0.85em 1.45em;
  text-decoration: none;

  :hover {
    color: ${props => !props.disabled && color("brand")};
    background-color: ${props => !props.disabled && color("bg-light")};
  }

  > .Icon {
    color: ${props => color(props.disabled ? "text-light" : "text-dark")};
    margin-right: 0.65em;
  }

  :hover > .Icon {
    color: ${props => !props.disabled && color("brand")};
  }
`;

export const MenuItemIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const MenuItemTitle = styled.span`
  font-weight: bold;
  line-height: 1rem;
`;

export const MenuLink = styled(Link)`
  display: block;
`;

export const MenuExternalLink = styled(ExternalLink)`
  text-decoration: none;
  display: block;
`;
