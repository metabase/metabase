import styled from "@emotion/styled";
import InputBase from "metabase/core/components/Input";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const OptionEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const AddMorePrompt = styled.div`
  text-align: center;
  font-size: 0.875rem;
  margin: ${space(1)} 0;
  height: 1.25rem;
  color: ${color("text-light")};
  transition: opacity 0.2s ease-in-out;
`;

export const StyledTextArea = styled.textarea`
  resize: none;
  border: none;
  outline: 1px solid ${color("border")};
  width: 20rem;
  border-radius: ${space(1)};
  padding: ${space(1)};
`;
