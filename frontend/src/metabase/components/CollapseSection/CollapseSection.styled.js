import styled, { css } from "styled-components";

import Icon from "metabase/components/Icon";

export const HeaderContainer = styled.div.attrs({
  role: "button",
  tabIndex: "0",
})`
  display: flex;
  align-items: center;
  cursor: pointer;
`;

export const Header = styled.span`
  display: flex;
  align-items: center;
`;

const ICON_VARIANTS = {
  "right-down": {
    collapsed: "chevronright",
    expanded: "chevrondown",
  },
  "up-down": {
    collapsed: "chevrondown",
    expanded: "chevronup",
  },
};

export const ToggleIcon = styled(Icon).attrs({
  name: ({ isExpanded, variant }) => {
    const { collapsed, expanded } = ICON_VARIANTS[variant];
    return isExpanded ? expanded : collapsed;
  },
  size: 12,
})`
  ${props => css`
    margin-${props.position === "left" ? "right" : "left"}: 0.5rem;
  `};
`;
