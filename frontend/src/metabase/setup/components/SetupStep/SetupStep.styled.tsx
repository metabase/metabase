import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StepRoot = styled.section`
  position: relative;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  padding: 4rem;
  margin-bottom: 1.75rem;
  background-color: ${color("white")};
`;

export const StepTitle = styled.div`
  color: ${color("brand")};
  font-size: 1.3125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;
