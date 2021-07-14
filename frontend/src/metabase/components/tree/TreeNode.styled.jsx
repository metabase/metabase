import styled, { css } from "styled-components";
import colors, { lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

// NOTE: whitelabeling/theming mutates colors object so we need to make it lazy
const TEXT_COLOR_BY_VARIANT = {
  default: () => colors["brand"],
  admin: () => colors["text-medium"],
};

const BACKGROUND_COLOR_BY_VARIANT = {
  default: () => colors["brand"],
  admin: () => colors["accent7"],
};

export const TreeNodeRoot = styled.li`
  display: flex;
  align-items: center;
  color: ${props =>
    props.isSelected
      ? colors["white"]
      : TEXT_COLOR_BY_VARIANT[props.variant]()};
  background-color: ${props =>
    props.isSelected ? BACKGROUND_COLOR_BY_VARIANT[props.variant]() : "unset"};
  padding-left: ${props => props.depth + 0.5}rem;
  padding-right: 0.5rem;
  cursor: pointer;
  font-weight: 700;

  &:hover {
    background-color: ${props =>
      props.isSelected
        ? BACKGROUND_COLOR_BY_VARIANT[props.variant]()
        : lighten(BACKGROUND_COLOR_BY_VARIANT[props.variant](), 0.6)};
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
    props.isSelected
      ? colors["white"]
      : TEXT_COLOR_BY_VARIANT[props.variant]()};
`;
