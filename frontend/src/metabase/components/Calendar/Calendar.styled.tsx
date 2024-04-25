import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { alpha, color } from "metabase/lib/colors";

type CalendarDayProps = {
  primaryColor?: string;
  isInRange?: boolean;
  isSelected?: boolean;
  isSelectedStart?: boolean;
  isSelectedEnd?: boolean;
};

export const CalendarDay = styled.div<CalendarDayProps>`
  background-color: ${({
    primaryColor = color("brand"),
    isSelected,
    isInRange,
  }) => {
    if (isSelected) {
      return primaryColor;
    } else if (isInRange) {
      return alpha(primaryColor, 0.1);
    }
    return "transparent";
  }};
  color: ${({ primaryColor = color("brand"), isSelected, isInRange }) =>
    !isSelected && isInRange ? primaryColor : undefined};

  &:hover {
    background-color: ${({ primaryColor = color("brand") }) => primaryColor};
    color: white;
  }

  ${({ primaryColor, isSelectedStart, isSelectedEnd }) =>
    (isSelectedStart || isSelectedEnd) &&
    css`
      color: ${color("white")} !important;
      background-color: ${primaryColor};
      z-index: 1;
    `}
`;

export const CalendarIconContainer = styled.div`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
