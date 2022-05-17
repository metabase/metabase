import React from "react";
import styled from "@emotion/styled";
import _ from "underscore";
import Icon from "metabase/components/Icon";
import { color, darken } from "metabase/lib/colors";

const BORDER_RADIUS = "8px";

export const SegmentedList = styled.ul`
  display: flex;
  width: ${props => (props.fullWidth ? 1 : 0)};
`;

function getDefaultBorderColor() {
  return darken(color("border"), 0.1);
}

const COLORS = {
  "fill-text": {
    background: () => "transparent",
    border: () => getDefaultBorderColor(),
    text: ({ isSelected, selectedColor, inactiveColor }) =>
      color(isSelected ? selectedColor : inactiveColor),
  },
  "fill-background": {
    background: ({ isSelected, selectedColor }) =>
      isSelected ? color(selectedColor) : "transparent",
    border: ({ isSelected, selectedColor }) =>
      isSelected ? color(selectedColor) : getDefaultBorderColor(),
    text: ({ isSelected, inactiveColor }) =>
      color(isSelected ? "text-white" : inactiveColor),
  },
};

export const SegmentedItem = styled.li`
  display: flex;
  flex-grow: ${props => (props.fullWidth ? 1 : 0)};

  background-color: ${props => COLORS[props.variant].background(props)};

  border: 1px solid ${props => COLORS[props.variant].border(props)};

  border-right-width: ${props => (props.isLast ? "1px" : 0)};
  border-top-left-radius: ${props => (props.isFirst ? BORDER_RADIUS : 0)};
  border-bottom-left-radius: ${props => (props.isFirst ? BORDER_RADIUS : 0)};
  border-top-right-radius: ${props => (props.isLast ? BORDER_RADIUS : 0)};
  border-bottom-right-radius: ${props => (props.isLast ? BORDER_RADIUS : 0)};
`;

export const SegmentedItemLabel = styled.label`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  position: relative;
  font-weight: bold;
  color: ${props => COLORS[props.variant].text(props)};
  padding: ${props => (props.compact ? "8px" : "8px 12px")};
  cursor: pointer;

  :hover {
    color: ${props => (!props.isSelected ? color(props.selectedColor) : null)};
  }
`;

export const SegmentedControlRadio = styled.input`
  cursor: inherit;
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  z-index: 1;
`;

SegmentedControlRadio.defaultProps = { type: "radio" };

function IconWrapper(props) {
  return <Icon {..._.omit(props, "iconOnly")} />;
}

export const ItemIcon = styled(IconWrapper)`
  margin-right: ${props => (props.iconOnly ? 0 : "4px")};
`;
