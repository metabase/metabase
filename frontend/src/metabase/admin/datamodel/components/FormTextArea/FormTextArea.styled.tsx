import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";

export interface FormTextAreaRootProps {
  touched?: boolean;
  error?: string | boolean;
}

export const FormTextAreaRoot = styled.textarea<FormTextAreaRootProps>`
  width: 100%;

  &:not(:focus) {
    border-color: ${props => props.touched && props.error && color("error")};
  }
`;
