import styled from "@emotion/styled";
import { css } from "@emotion/react";
import Icon from "metabase/components/Icon";

export const HeaderContainer = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
`;

HeaderContainer.defaultProps = {
  role: "button",
  tabIndex: "0",
};

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

export const ToggleIcon = styled(Icon)`
  ${props => css`
    margin-${props.position === "left" ? "right" : "left"}: 0.5rem;
  `};
`;

ToggleIcon.defaultProps = {
  name: ({ isExpanded, variant }) => {
    const { collapsed, expanded } = ICON_VARIANTS[variant];
    return isExpanded ? expanded : collapsed;
  },
  size: 12,
};
