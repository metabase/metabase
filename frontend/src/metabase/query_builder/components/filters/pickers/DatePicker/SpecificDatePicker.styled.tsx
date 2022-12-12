import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";

export const CalendarIcon = styled(Icon)`
  margin-right: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("filter")};
  }
`;

export const DateInput = styled(InputBlurChange)`
  ${InputBlurChange.Field} {
    font-size: 1rem;
    font-weight: 700;
    width: 100%;
    padding: 0.5rem;
  }
`;

interface DateInputContainerProps {
  isActive?: boolean;
}

export const DateInputContainer = styled.div<DateInputContainerProps>`
  display: flex;
  align-items: center;
  width: 100%;
  margin-bottom: 1rem;

  &:focus-within {
    border-color: ${color("brand")};
  }
`;
