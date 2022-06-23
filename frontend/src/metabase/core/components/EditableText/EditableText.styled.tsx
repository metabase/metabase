import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const EditableTextRoot = styled.div`
  position: relative;
  padding: 0.25rem;
  border: 1px solid transparent;

  &:hover,
  &:focus-within {
    border-color: ${color("border")};
  }
`;

export interface isMultilineProps {
  isMultiline: boolean;
}

export const EditableTextContent = styled.div<isMultilineProps>`
  visibility: hidden;
  overflow: ${props => (props.isMultiline ? "" : "hidden")};
  white-space: ${props => (props.isMultiline ? "pre-wrap" : "nowrap")};
  word-wrap: ${props => (props.isMultiline ? "break-word" : "")};
`;

export const EditableTextArea = styled.textarea`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  cursor: pointer;
  border: none;
  resize: none;
  outline: none;
  overflow: hidden;
  background: transparent;

  &:focus {
    cursor: text;
  }
`;
