import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FormSection = styled.div`
  margin: 1rem 0 1.5rem;
`;

export const FormSectionTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  padding: 0 2rem;
`;

export const FormFooter = styled.div`
  display: flex;
  justify-content: end;
  gap: 1rem;
  padding: 0 2rem 1.5rem;
`;
