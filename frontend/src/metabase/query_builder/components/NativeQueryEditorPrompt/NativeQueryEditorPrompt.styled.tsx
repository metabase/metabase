import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import { color } from "metabase/lib/colors";

export const NativeQueryEditorPromptRoot = styled.div`
  border-top: 1px solid ${color("border")};
  height: 3rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1.25rem;
`;

export const PromptInput = styled(Input)`
  flex-grow: 1;

  ${Input.Field} {
    border: none;
    outline: none !important;
    background-color: transparent;
  }

  background-color: transparent;
`;

export const ErrorRoot = styled.div`
  padding: 0 1rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  font-weight: 700;
`;

export const ButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;
