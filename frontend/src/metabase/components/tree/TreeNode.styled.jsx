import styled, { css } from "styled-components";
import colors, { lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

const COLOR_SCHEMES = {
  admin: {
    text: colors["text-medium"],
    background: colors["accent7"],
  },
  default: {
    text: colors["brand"],
    background: colors["brand"],
  },
};

export const TreeNodeRoot = styled.li`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected ? colors["white"] : COLOR_SCHEMES[props.colorScheme].text};
  background-color: ${props =>
    props.isSelected ? COLOR_SCHEMES[props.colorScheme].background : "unset"};
  padding-left: ${props => props.depth + 0.5}rem;
  padding-right: 0.5rem;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background-color: ${props =>
      props.isSelected
        ? COLOR_SCHEMES[props.colorScheme].background
        : lighten(COLOR_SCHEMES[props.colorScheme].background, 0.6)};
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

export const ExpandToggleIcon = styled(Icon).attrs({
  name: "chevronright",
  size: 12,
})`
  transition: transform 200ms;

  ${props =>
    props.isExpanded &&
    css`
      transform: rotate(90deg);
    `}
`;

export const NameContainer = styled.div`
  padding: 0.5rem 0.5rem 0.5rem 0.25rem;
  flex: 1;
`;

export const IconContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 0.25rem;
  opacity: 0.5;
`;

export const RightArrowContainer = styled.div`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected ? colors["white"] : COLOR_SCHEMES[props.colorScheme].text};
`;
