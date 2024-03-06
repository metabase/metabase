import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

export interface FormInputRootProps {
  touched?: boolean;
  error?: string | boolean;
}

export const FormInputRoot = styled.input<FormInputRootProps>`
  width: 100%;

  &:not(:focus) {
    border-color: ${props => props.touched && props.error && color("error")};
  }
`;
