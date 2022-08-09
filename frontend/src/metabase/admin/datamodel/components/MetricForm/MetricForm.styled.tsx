import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const FormRoot = styled.form`
  width: 100%;
`;

export const FormSection = styled.div`
  margin: 0 auto;
  padding: 0 1em;

  ${breakpointMinSmall} {
    padding-left: 1.75rem;
    padding-right: 1.75rem;
  }

  ${breakpointMinMedium} {
    padding-left: 2.625rem;
    padding-right: 2.625rem;
  }
`;

export const FormBody = styled(FormSection)`
  padding-top: 2rem;
  padding-bottom: 2rem;
`;

export const FormBodyContent = styled.div`
  max-width: 36rem;
`;

export const FormFooter = styled.div`
  padding-top: 2rem;
  padding-bottom: 2rem;
  border-top: 1px solid ${color("border")};
`;

export const FormFooterContent = styled.div`
  display: flex;
  align-items: center;
`;

export const FormSubmitButton = styled(Button)`
  margin-right: 1rem;
`;

export interface FormInputRootProps {
  touched: boolean;
  error?: string;
}

export const FormInputRoot = styled.input<FormInputRootProps>`
  width: 100%;

  &:not(:focus) {
    border-color: ${props => props.touched && props.error && color("error")};
  }
`;

export const FormLabelRoot = styled.div`
  margin-bottom: 2rem;
`;

export const FormLabelContent = styled.div`
  max-width: 36rem;
`;

export const FormLabelTitle = styled.label`
  font-size: 0.83em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export const FormLabelDescription = styled.p`
  margin-top: 0.5rem;
  margin-bottom: 1rem;
`;
