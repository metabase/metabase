import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import Input from "metabase/core/components/Input";

export const SuggestionInput = styled(Input)`
  display: block;

  ${Input.Field} {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
  }
`;

export const SuggestionContainer = styled.div`
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
`;

export const Suggestion = styled.span`
  font-size: 0.875rem;
  font-weight: 700;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;

  &:hover {
    color: ${color("brand")};
    background: ${lighten("brand")};
    cursor: pointer;
  }
`;
