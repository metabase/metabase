// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { IconName, IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

type HeaderContainerProps = HTMLAttributes<HTMLDivElement> & {
  hasRightAction?: boolean;
};

export const HeaderContainer = styled(
  ({ hasRightAction, ...props }: HeaderContainerProps) => (
    <div
      {...props}
      role={props.role ?? "button"}
      tabIndex={props.tabIndex ?? 0}
    />
  ),
)`
  display: flex;
  align-items: center;
  cursor: pointer;
  min-height: 28px;
  ${(props) => props.hasRightAction && "justify-content: space-between;"}
`;

export const Header = styled.span`
  display: flex;
  align-items: center;
`;

export const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
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
  ${(props) => css`
    margin-${props.position === "left" ? "right" : "left"}: 0.5rem;
  `};
`;
