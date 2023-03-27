import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FormSection = styled.div`
  margin-top: 1rem;
  margin-bottom: 1.5rem;
`;

export const FormSectionTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  margin-left: 2rem;
  margin-right: 2rem;
`;

export const FormFooter = styled.div`
  display: flex;
  justify-content: end;
  gap: 1rem;
`;
