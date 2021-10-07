import styled, { css } from "styled-components";
import Icon from "metabase/components/Icon";

export const HeaderContainer = styled.div.attrs({
  role: "button",
  tabIndex: 0,
})`
  display: flex;
  align-items: center;
  cursor: pointer;
`;

export const Header = styled.span`
  display: flex;
  align-items: center;
`;

type Variants = "right-down" | "up-down";

const ICON_VARIANTS: {
  [name in Variants]: { collapsed: string; expanded: string };
} = {
  "right-down": {
    collapsed: "chevronright",
    expanded: "chevrondown",
  },
  "up-down": {
    collapsed: "chevrondown",
    expanded: "chevronup",
  },
};

type Props = {
  variant: Variants;
  isExpanded: boolean;
  position?: "left" | "right";
};

export const ToggleIcon = styled(Icon).attrs({
  name: ({ isExpanded, variant }: Props) => {
    const { collapsed, expanded } = ICON_VARIANTS[variant];
    return isExpanded ? expanded : collapsed;
  },
  size: 12,
})<Props>`
  ${props => css`
    margin-${props.position === "left" ? "right" : "left"}: 0.5rem;
  `};
`;
