import { css } from "@emotion/react";
import styled from "@emotion/styled";
import _ from "underscore";

import { color, darken, alpha } from "metabase/lib/colors";
import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

export type SegmentedControlVariant =
  | "fill-text"
  | "fill-background"
  | "fill-all";

type ColorProps = {
  isSelected: boolean;
  selectedColor: string;
  inactiveColor: string;
};

function getDefaultBorderColor() {
  return darken(color("border"), 0.1);
}

const COLORS = {
  "fill-text": {
    background: () => "transparent",
    border: () => getDefaultBorderColor(),
    text: ({ isSelected, selectedColor, inactiveColor }: ColorProps) =>
      color(isSelected ? selectedColor : inactiveColor),
  },
  "fill-background": {
    background: ({ isSelected, selectedColor }: ColorProps) =>
      isSelected ? color(selectedColor) : "transparent",
    border: ({ selectedColor }: ColorProps) => color(selectedColor),
    text: ({ isSelected, inactiveColor }: ColorProps) =>
      color(isSelected ? "text-white" : inactiveColor),
  },
  "fill-all": {
    background: ({ isSelected, selectedColor }: ColorProps) =>
      isSelected ? alpha(color(selectedColor), 0.2) : "transparent",
    border: ({ isSelected, selectedColor }: ColorProps) =>
      isSelected ? color(selectedColor) : getDefaultBorderColor(),
    text: ({ isSelected, selectedColor, inactiveColor }: ColorProps) =>
      color(isSelected ? selectedColor : inactiveColor),
  },
};

type BorderStyleProps = {
  index: number;
  isSelected: boolean;
  total: number;
  selectedOptionIndex: number;
};

function getSpecialBorderStyles({
  index,
  isSelected,
  total,
  selectedOptionIndex,
}: BorderStyleProps) {
  if (isSelected) {
    return css`
      border-right-width: 1px;
      border-left-width: 1px;
    `;
  }

  const isBeforeSelected = index === selectedOptionIndex - 1;
  if (isBeforeSelected) {
    return css`
      border-right-width: 0;
    `;
  }

  const isAfterSelected = index === selectedOptionIndex + 1;
  if (isAfterSelected) {
    return css`
      border-left-width: 0;
    `;
  }

  const isFirst = index === 0;
  if (isFirst) {
    return css`
      border-left-width: 1px;
      border-right-width: 0;
    `;
  }
  const isLast = index === total - 1;
  if (isLast) {
    return css`
      border-right-width: 1px;
      border-left-width: 0;
    `;
  }
}

type SegmentedItemProps = BorderStyleProps &
  ColorProps & {
    fullWidth?: boolean;
    variant: SegmentedControlVariant;
  };

export const SegmentedItem = styled.li<SegmentedItemProps>`
  display: flex;
  flex-grow: ${props => (props.fullWidth ? 1 : 0)};
  background-color: ${props => COLORS[props.variant].background(props)};
  border: 1px solid ${props => COLORS[props.variant].border(props)};

  ${props => getSpecialBorderStyles(props)};
`;

type SegmentedItemLabelProps = ColorProps & {
  compact?: boolean;
  variant: SegmentedControlVariant;
};

export const SegmentedItemLabel = styled.label<SegmentedItemLabelProps>`
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

function IconWrapper(props: IconProps & { iconOnly?: boolean }) {
  return <Icon {..._.omit(props, "iconOnly")} />;
}

export const ItemIcon = styled(IconWrapper)`
  margin-right: ${props => (props.iconOnly ? 0 : "4px")};
`;

const BORDER_RADIUS = "8px";

export const SegmentedList = styled.ul`
  display: flex;

  ${SegmentedItem} {
    &:first-of-type {
      border-top-left-radius: ${BORDER_RADIUS};
      border-bottom-left-radius: ${BORDER_RADIUS};
    }

    &:last-of-type {
      border-top-right-radius: ${BORDER_RADIUS};
      border-bottom-right-radius: ${BORDER_RADIUS};
    }
  }
`;
