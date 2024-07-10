import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

interface TreeNodeRootProps {
  isSelected: boolean;
  depth: number;
}

export const TreeNodeRoot = styled.li<TreeNodeRootProps>`
  display: flex;
  align-items: center;
  color: ${props => (props.isSelected ? color("white") : color("brand"))};
  background-color: ${props => (props.isSelected ? color("brand") : "unset")};
  padding-left: ${props => props.depth + 0.5}rem;
  padding-right: 0.5rem;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background-color: ${props =>
      props.isSelected ? color("brand") : lighten("brand", 0.6)};
  }
`;

export const ExpandToggleButton = styled.button`
  cursor: pointer;
  padding: 0.5rem 0.25rem 0.5rem 0.25rem;
  display: block;
  color: inherit;
  visibility: ${props => (props.hidden ? "hidden" : "visible")};
`;

interface ExpandToggleIconProps {
  isExpanded: boolean;
}

export const ExpandToggleIcon = styled(Icon)<ExpandToggleIconProps & IconProps>`
  transition: transform 200ms;

  ${props =>
    props.isExpanded &&
    css`
      transform: rotate(90deg);
    `}
`;

ExpandToggleIcon.defaultProps = {
  name: "chevronright",
  size: 12,
};

export const NameContainer = styled.div`
  word-break: break-word;
  padding: 0.5rem 0.5rem 0.5rem 0.25rem;
  flex: 1;
`;

export const IconContainer = styled.div<{ transparent?: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.25rem;
  opacity: ${props => (props.transparent ? 0.5 : 1)};
`;

IconContainer.defaultProps = {
  transparent: true,
};
