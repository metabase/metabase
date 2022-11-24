import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

interface RadioIconProps {
  isSelected: boolean;
}

export const RadioIcon = styled(Icon)<RadioIconProps>`
  margin-left: 0.5rem;
  cursor: pointer;
  user-select: none;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  padding: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }

  ${props => props.isSelected && `color: ${color("brand")}`}
`;
