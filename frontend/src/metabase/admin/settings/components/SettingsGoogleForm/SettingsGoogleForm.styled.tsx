import styled from "@emotion/styled";
import Form from "metabase/containers/FormikForm";
import { color } from "metabase/lib/colors";

export const FormRoot = styled(Form)`
  margin: 0 1rem;
  max-width: 32.5rem;
`;

export const FormHeader = styled.h2`
  margin-top: 1rem;
`;

export const FormCaption = styled.p`
  color: ${color("text-medium")};
`;

export const FormSection = styled.div`
  display: flex;
  gap: 0.5rem;
`;
