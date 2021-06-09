import styled, { css } from "styled-components";
import colors, { lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const TreeNodeRoot = styled.li`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected ? colors["white"] : colors["text-medium"]};
  background-color: ${props =>
    props.isSelected ? colors["accent7"] : "unset"};
  padding-left: ${props => props.depth + 1}rem;
  padding-right: 0.5rem;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background-color: ${props =>
      props.isSelected ? colors["accent7"] : lighten(colors["accent7"], 0.65)};
  }
`;

export const ExpandToggleButton = styled.button`
  display: flex;
  cursor: pointer;
  padding: 0.5rem 0.25rem 0.5rem 0.25rem;
  display: block;
  color: inherit;
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
`;

export const RightArrowContainer = styled.div`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected ? colors["white"] : colors["text-light"]};
`;
