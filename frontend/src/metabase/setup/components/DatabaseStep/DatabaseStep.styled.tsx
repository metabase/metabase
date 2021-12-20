import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StepLink = styled.a`
  cursor: pointer;
  text-decoration: none;
  color: ${color("brand")};

  &:hover {
    text-decoration: underline;
  }
`;

export const StepActions = styled.div`
  margin-top: 1rem;
`;

export const StepDescription = styled.div`
  margin: 0.875rem 0 2rem;
  color: ${color("text-medium")};
`;

export const StepFormGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
`;
