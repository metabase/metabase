import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import Card from "../Card";

export const AIPromptRoot = styled(Card)`
  width: 100%;
  display: flex;
  padding: 1rem;
  align-items: center;
`;

export const AIPromptUserAvatar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 1rem;
`;

export const AIPromptInputContainer = styled.div`
  flex-grow: 1;
  margin-right: 1rem;
`;

export const AIPromptInput = styled(Input)`
  ${Input.Field} {
    border: none;
    /* FIXME: important + poor a11y */
    outline: none !important;
  }
`;

export const AIPromptActions = styled.div`
  flex-shrink: 0;
`;
