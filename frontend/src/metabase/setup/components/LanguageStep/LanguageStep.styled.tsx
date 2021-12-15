import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const StepDescription = styled.div`
  color: ${color("text-dark")};
  margin: 0.875rem 0;
`;

export const StepList = styled.ol`
  margin-bottom: 2rem;
  padding: 0.5rem;
  max-height: 17.5rem;
  overflow-y: scroll;
  border: 1px solid ${color("border")};
  border-radius: 0.25rem;
`;

interface StepListItemProps {
  isSelected?: boolean;
}

export const StepListItem = styled.li<StepListItemProps>`
  padding: 0.5rem;
  color: ${props => color(props.isSelected ? "white" : "text-dark")};
  border-radius: 0.25rem;
  background-color: ${props => color(props.isSelected ? "brand" : "white")};
  cursor: pointer;
  font-weight: 700;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
