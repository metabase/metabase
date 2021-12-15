import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StepDescription = styled.div`
  margin: 0.875rem 0;
  color: ${color("text-dark")};
`;

export const StepToggleContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 1rem;
  border: 2px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const StepToggleText = styled.div`
  color: ${color("text-dark")};
  margin-left: 0.5rem;
`;
