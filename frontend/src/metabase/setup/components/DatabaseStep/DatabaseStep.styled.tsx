import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StepDescription = styled.div`
  margin: 0.875rem 0 2rem;
  color: ${color("text-medium")};
`;

export const UserFormGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
`;
