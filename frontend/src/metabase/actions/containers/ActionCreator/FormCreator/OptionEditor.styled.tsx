import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const OptionEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${space(2)};
  gap: ${space(1)};
`;

export const AddMorePrompt = styled.div<{ isVisible: boolean }>`
  text-align: center;
  font-size: 0.875rem;
  height: 1.25rem;
  color: ${color("text-light")};
  transition: opacity 0.2s ease-in-out;
  opacity: ${props => (props.isVisible ? 1 : 0)};
`;

export const ErrorMessage = styled.div`
  text-align: center;
  font-size: 0.875rem;
  color: ${color("error")};
`;

export const TextArea = styled.textarea`
  resize: none;
  border: none;
  outline: 1px solid ${color("border")};
  width: 20rem;
  border-radius: ${space(1)};
  padding: ${space(1)};
`;
