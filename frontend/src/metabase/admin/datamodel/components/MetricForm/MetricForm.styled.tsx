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
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }

  ${breakpointMinMedium} {
    padding-left: 2rem;
    padding-right: 2rem;
  }
`;

export const FormBody = styled(FormSection)`
  padding-top: 4rem;
  padding-bottom: 4rem;
`;

export const FormBodyContent = styled.div`
  max-width: 36rem;
`;

export const FormFooter = styled.div`
  padding-top: 4rem;
  padding-bottom: 4rem;
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
  font-weight: bold;
  text-transform: uppercase;
`;

export const FormLabelDescription = styled.p`
  margin-top: 0.5rem;
  margin-bottom: 1rem;
`;
