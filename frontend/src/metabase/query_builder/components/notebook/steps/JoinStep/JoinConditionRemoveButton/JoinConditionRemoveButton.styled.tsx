import styled from "@emotion/styled";

import { alpha, color, lighten } from "metabase/lib/colors";

interface RemoveButtonProps {
  isConditionComplete: boolean;
}

export const RemoveButton = styled.button<RemoveButtonProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  cursor: pointer;
  border-radius: 0 8px 8px 0;
  border-left: 1px solid ${alpha(color("white"), 0.25)};
  color: ${props =>
    props.isConditionComplete ? color("white") : color("brand")};

  &:hover,
  &:focus {
    background-color: ${props =>
      props.isConditionComplete ? lighten("brand", 0.1) : alpha("brand", 0.2)};
  }
`;
