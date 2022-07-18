import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface SelectPickerButtonProps {
  isSelected: boolean;
}

export const SelectPickerButton = styled.button<SelectPickerButtonProps>`
  border: 1px solid ${color("filter")};
  color: ${props => (props.isSelected ? color("white") : color("filter"))};
  background-color: ${props =>
    props.isSelected ? color("filter") : color("white")};
`;
