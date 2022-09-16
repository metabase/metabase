import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

interface RadioIconProps {
  isSelected: boolean;
}

export const RadioIcon = styled(Icon)<RadioIconProps>`
  margin-left: 1rem;
  cursor: pointer;
  user-select: none;

  ${props => props.isSelected && `color: ${color("brand")}`}
`;
