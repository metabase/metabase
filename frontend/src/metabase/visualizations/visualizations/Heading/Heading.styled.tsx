import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface InputContainerProps {
  isPreviewing: boolean;
}

export const InputContainer = styled.div<InputContainerProps>`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0 0.65em;
  padding-left: 0;
  pointer-events: auto;

  ${({ isPreviewing }) =>
    !isPreviewing &&
    `
    padding: 0 0.75em;
  `}
`;

export const TextInput = styled.input`
  border: none;
  background: none;
  max-height: 50%;
  color: ${color("text-dark")};
  font-size: 1.5em;
  font-weight: 700;
  height: inherit;
  line-height: 1.602em;
  min-height: unset;
  outline: none;
  padding: 0.25em 0.2em;
  pointer-events: all;
  resize: none;
  width: 100%;
`;

export const HeadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  width: 100%;
`;

interface HeadingContentProps {
  hasNoContent?: boolean;
  isEditing?: boolean;
}

export const HeadingContent = styled.h2<HeadingContentProps>`
  max-height: 100%;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 0.75em;
  margin: 0;
  pointer-events: all;

  ${({ hasNoContent }) =>
    hasNoContent &&
    `
    color: ${color("text-light")};
  `}
  ${({ isEditing }) =>
    isEditing &&
    `
    cursor: text;
  `}
`;
