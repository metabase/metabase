import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { css } from "@emotion/react";

export const SharedStyles = css`
  border: 1px solid transparent;
  border-radius: 0.25rem;
  padding: 0.5rem;
  grid-area: 1 / 1 / 2 / 2;
  font-size: 0.875rem;
  line-height: 1.25rem;
  min-height: 0;
  color: ${color("text-dark")};
`;

export type TEXT = string | null | undefined;

interface EditableTextRootProps {
  value: TEXT;
}

export const EditableTextRoot = styled.div<EditableTextRootProps>`
  display: grid;
  max-width: 500px;

  &:after {
    content: "${props => props.value?.replace(/\n/g, "\\00000a")} ";
    white-space: pre-wrap;
    visibility: hidden;
    ${SharedStyles}
  }
`;

export const EditableTextArea = styled.textarea`
  resize: none;
  overflow: hidden;
  cursor: pointer;
  outline: none;
  &:hover,
  &:focus {
    border: 1px solid ${color("border")};
  }

  &:focus {
    cursor: text;
  }

  ${SharedStyles}
`;
