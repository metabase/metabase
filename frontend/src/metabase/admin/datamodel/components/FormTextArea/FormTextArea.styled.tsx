import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface FieldTextAreaProps {
  touched: boolean;
  error?: string;
}

export const FieldTextArea = styled.textarea<FieldTextAreaProps>`
  width: 100%;

  &:not(:focus) {
    border-color: ${props => props.touched && props.error && color("error")};
  }
`;
