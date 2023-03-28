import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import Form from "metabase/core/components/Form";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";

export const FormRoot = styled.div`
  padding: 1rem;
`;

export const FormSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const InlineForm = styled(Form)`
  display: flex;
  gap: 0.5rem;
  flex: 1 0 auto;
  position: relative;
`;

export const InlineFormInput = styled(FormInput)`
  flex: 1 0 auto;
  margin-bottom: 0;

  ${Input.Field} {
    padding-right: 2.5rem;
  }
`;

export const InlineFormSubmitButton = styled(FormSubmitButton)`
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
`;
