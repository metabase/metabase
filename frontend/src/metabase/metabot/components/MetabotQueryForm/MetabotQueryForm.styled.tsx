import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FormRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
`;

export const FormSectionTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  padding: 1.5rem 2rem 1rem;
`;

export const FormFooter = styled.div`
  display: flex;
  justify-content: end;
  gap: 1rem;
  padding: 0 2rem 1.5rem;
`;
