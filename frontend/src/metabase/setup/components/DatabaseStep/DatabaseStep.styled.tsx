import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const StepButton = styled(Button)`
  color: ${color("brand")};
  font-weight: normal;
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    text-decoration: underline;
    background-color: transparent;
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

export const FormActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;
