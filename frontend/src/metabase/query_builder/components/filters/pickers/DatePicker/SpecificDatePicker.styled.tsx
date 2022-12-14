import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const CalendarIcon = styled(Icon)`
  margin-right: 0.5rem;
  margin-left: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("filter")};
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
