import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface FieldInputProps {
  touched: boolean;
  error?: string;
}

export const FieldInput = styled.input<FieldInputProps>`
  width: 100%;

  &:not(:focus) {
    border-color: ${props => props.touched && props.error && color("error")};
  }
`;
