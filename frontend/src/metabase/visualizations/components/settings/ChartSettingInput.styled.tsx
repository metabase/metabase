import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";

import { color } from "metabase/lib/colors";

export const ChartSettingInputBlurChange = styled(Input)`
  display: block;

  ${Input.Field} {
    font-size: 0.875rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
  }
`;

export const SuggestionContainer = styled.div`
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
`;

export const Suggestion = styled.span`
  font-size: 0.75rem;
  margin-bottom: 0.25rem;

  &:hover {
    color: ${color("brand")};
    cursor: pointer;
  }
`;
