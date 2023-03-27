import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import Form from "metabase/core/components/Form";
import FormField from "metabase/core/components/FormField";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";

export const FeedbackSelectionRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const WrongDataFormRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const InlineForm = styled(Form)`
  display: flex;
  gap: 0.5rem;
  position: relative;

  ${FormField.Root} {
    margin-bottom: 0;
  }

  ${Input.Field} {
    padding-right: 2.5rem;
  }
`;

export const InlineSubmitButton = styled(FormSubmitButton)`
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
`;
