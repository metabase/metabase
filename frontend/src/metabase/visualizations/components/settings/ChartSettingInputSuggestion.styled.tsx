import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import SelectList from "metabase/components/SelectList";

export const SuggestionInput = styled(Input)`
  display: block;

  ${Input.Field} {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
  }
`;

export const SuggestionContainer = styled(SelectList)`
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
`;
