import styled from "@emotion/styled";
import { css } from "@emotion/react";
import colors, { lighten } from "metabase/lib/colors";
import Icon, { IconProps } from "metabase/components/Icon";
import { ColorScheme } from "./types";

const COLOR_SCHEMES = {
  admin: {
    text: () => colors["text-medium"],
    background: () => colors["accent7"],
  },
  default: {
    text: () => colors["brand"],
    background: () => colors["brand"],
  },
};

interface TreeNodeRootProps {
  isSelected: boolean;
  depth: number;
  colorScheme: ColorScheme;
}

export const TreeNodeRoot = styled.li<TreeNodeRootProps>`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected
      ? colors["white"]
      : COLOR_SCHEMES[props.colorScheme].text()};
  background-color: ${props =>
    props.isSelected ? COLOR_SCHEMES[props.colorScheme].background() : "unset"};
  padding-left: ${props => props.depth + 0.5}rem;
  padding-right: 0.5rem;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background-color: ${props =>
      props.isSelected
        ? COLOR_SCHEMES[props.colorScheme].background()
        : lighten(COLOR_SCHEMES[props.colorScheme].background(), 0.6)};
  }
`;

export const ExpandToggleButton = styled.button`
  display: flex;
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

export const IconContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 0.25rem;
  opacity: 0.5;
`;
