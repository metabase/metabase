import styled from "@emotion/styled";
import ActionButton from "metabase/components/ActionButton";
import { Form } from "metabase/forms";

export const FormButton = styled(ActionButton)`
  margin-right: 0.5rem;
`;

export const JWTForm = styled(Form)`
  max-width: 32.5rem;
  margin: 0 1rem;
`;

export const JWTFormFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 1rem;
`;
