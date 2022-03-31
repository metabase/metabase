import styled from "@emotion/styled";
import { css } from "@emotion/react";
import colors, { lighten } from "metabase/lib/colors";
import Icon, { IconProps } from "metabase/components/Icon";
import { space } from "metabase/styled-components/theme";

interface TreeNodeRootProps {
  isSelected: boolean;
  depth: number;
}

const ItemColor = lighten(colors["brand"], 0.6);

export const TreeNodeRoot = styled.li<TreeNodeRootProps>`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected ? colors["brand"] : colors["text-medium"]};
  background-color: ${props => (props.isSelected ? ItemColor : "unset")};
  padding-left: ${props => props.depth}rem;
  padding-right: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background-color: ${ItemColor};
    color: ${colors["brand"]};

    .Icon {
      color: ${colors["brand"]};
    }
  }

  .Icon {
    color: ${props =>
      props.isSelected ? colors["brand"] : colors["brand-light"]};
  }
`;

export const ExpandToggleButton = styled.button`
  display: flex;
  cursor: pointer;
  padding: 4px 0 4px 2px;
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
  padding: 6px 3px;
  flex: 1;
`;

export const IconContainer = styled.div<{ transparent?: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.25rem;
`;

IconContainer.defaultProps = {
  transparent: true,
};
