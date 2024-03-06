import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

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
