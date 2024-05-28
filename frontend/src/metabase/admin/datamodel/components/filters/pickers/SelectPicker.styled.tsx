import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface SelectPickerButtonProps {
  isSelected: boolean;
}

export const SelectPickerButton = styled.button<SelectPickerButtonProps>`
  color: ${props => (props.isSelected ? color("white") : color("filter"))};
  text-align: center;
  font-weight: 700;
  width: 100%;
  height: 95px;
  border: 1px solid ${color("filter")};
  border-radius: 0.5rem;
  background-color: ${props =>
    props.isSelected ? color("filter") : color("white")};
`;
