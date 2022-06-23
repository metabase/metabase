import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const EditableTextRoot = styled.div`
  position: relative;
  border: 1px solid transparent;

  &:hover,
  &:focus-within {
    border-color: ${color("border")};
  }
`;

export const EditableTextContent = styled.div`
  visibility: hidden;
  white-space: pre-wrap;
  word-wrap: break-word;
`;

export const EditableTextArea = styled.textarea`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
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
