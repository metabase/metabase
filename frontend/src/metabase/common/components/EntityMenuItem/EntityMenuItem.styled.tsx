// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { Link } from "react-router";

import ExternalLink from "metabase/common/components/ExternalLink";
import type { ColorName } from "metabase/lib/colors/types";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

interface MenuItemProps {
  color?: ColorName;
  hoverColor?: ColorName;
  hoverBgColor?: ColorName;
  disabled?: boolean;
}

export const MenuItemContent = styled.div<MenuItemProps>`
  display: flex;
  align-items: center;
  border-radius: 0.5em;
  cursor: ${(props) => (props.disabled ? "not-allowed" : "pointer")};
  color: ${(props) =>
    color(props.disabled ? "text-tertiary" : props.color || "text-primary")};
  padding: 0.85em 1.45em;
  text-decoration: none;

  :hover {
    color: ${(props) =>
      color((!props.disabled && props.hoverColor) || "brand")};
    background-color: ${(props) =>
      !props.disabled && props.hoverBgColor
        ? color(props.hoverBgColor)
        : "var(--mb-color-background-secondary)"};
  }

  > .Icon {
    color: ${(props) =>
      color(props.disabled ? "text-tertiary" : props.color || "text-primary")};
    margin-right: 0.65em;
  }

  :hover > .Icon {
    color: ${(props) =>
      color((!props.disabled && props.hoverColor) || "brand")};
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
