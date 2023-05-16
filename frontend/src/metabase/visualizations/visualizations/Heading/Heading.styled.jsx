import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const InputContainer = styled.div`
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0 0.65em;
  padding-left: 0;

  ${({ isPreviewing }) =>
    !isPreviewing &&
    `
    padding: 0 0.75em;
  `}
  ${({ isFocused }) =>
    isFocused &&
    `
    border: 1px solid ${color("brand")};
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
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  width: 100%;
`;

export const HeadingContent = styled.h2`
  max-height: 100%;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.75em;
  margin: 0;
  pointer-events: all;
`;
