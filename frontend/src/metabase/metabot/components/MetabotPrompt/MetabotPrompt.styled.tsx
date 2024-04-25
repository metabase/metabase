import styled from "@emotion/styled";

import UserAvatar from "metabase/components/UserAvatar";
import Input from "metabase/core/components/Input";
import { color } from "metabase/lib/colors";
import RunButton from "metabase/query_builder/components/RunButton";

export const PromptSection = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1rem;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  box-shadow: 0 2px 2px ${color("shadow")};
  background-color: ${color("bg-white")};
`;

export const PromptUserAvatar = styled(UserAvatar)`
  flex-shrink: 0;
  background-color: ${color("accent2")};
`;

export const PromptRunButton = styled(RunButton)`
  flex-shrink: 0;
`;

export const PromptInput = styled(Input)`
  ${Input.Field} {
    border: none;
    outline: none !important;
  }
`;
