import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

export interface AmPmLabelProps {
  isSelected: boolean;
}

export const AmPmLabel = styled.span<AmPmLabelProps>`
  color: ${color("brand")};
  font-weight: 900;
  margin-right: 0.5rem;
  cursor: pointer;
`;
