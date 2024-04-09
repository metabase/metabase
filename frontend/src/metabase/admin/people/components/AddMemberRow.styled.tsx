import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

interface AddMemberAutocompleteSuggestionRootProps {
  isSelected?: boolean;
}

export const AddMemberAutocompleteSuggestionRoot = styled.div<AddMemberAutocompleteSuggestionRootProps>`
  padding: 0.5rem 1rem;
  cursor: pointer;
  background-color: ${props => props.isSelected && color("brand")};
`;
