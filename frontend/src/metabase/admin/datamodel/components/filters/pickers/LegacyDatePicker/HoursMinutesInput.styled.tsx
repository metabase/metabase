import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface AmPmLabelProps {
  isSelected: boolean;
}

export const AmPmLabel = styled.span<AmPmLabelProps>`
  color: ${props => props.isSelected && color("filter")};
  font-weight: ${props => props.isSelected && 900};
  margin-right: 0.5rem;
  cursor: ${props => !props.isSelected && "pointer"};

  &:hover {
    color: ${color("filter")};
  }
`;
