// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { IconName, IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

type HeaderContainerProps = HTMLAttributes<HTMLDivElement>;

export const HeaderContainer = styled((props: HeaderContainerProps) => (
  <div
    {...props}
    role={props.role ?? "button"}
    tabIndex={props.tabIndex ?? 0}
  />
))`
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

interface ToggleIconProps {
  isExpanded: boolean;
  position: string;
  variant: keyof typeof ICON_VARIANTS;
  size?: number;
}

export const ToggleIcon = styled(
  ({
    isExpanded,
    variant,
    size = 12,
    ...props
  }: ToggleIconProps & Omit<IconProps, "name">) => {
    const { collapsed, expanded } = ICON_VARIANTS[variant];
    const name = isExpanded ? expanded : collapsed;
    return <Icon name={name as IconName} size={size} {...props} />;
  },
)`
  ${props => css`
    margin-${props.position === "left" ? "right" : "left"}: 0.5rem;
  `};
`;
