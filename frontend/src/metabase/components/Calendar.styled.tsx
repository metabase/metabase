import { alpha, color } from "metabase/lib/colors";
import styled from "@emotion/styled";

type CalendarDayProps = {
  primaryColor?: string;
  isSelected?: boolean;
  isInRange?: boolean;
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
`;
