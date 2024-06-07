import styled from "@emotion/styled";

interface AddMemberAutocompleteSuggestionRootProps {
  isSelected?: boolean;
}

export const AddMemberAutocompleteSuggestionRoot = styled.div<AddMemberAutocompleteSuggestionRootProps>`
  padding: 0.5rem 1rem;
  cursor: pointer;
  background-color: ${props => props.isSelected && "var(--mb-color-brand)"};
`;
