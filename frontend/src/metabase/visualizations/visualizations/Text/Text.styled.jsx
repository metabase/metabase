import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const EditModeContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0.75rem;
  width: 100%;
  pointer-events: auto;

  &:hover {
    padding: calc(0.75rem - 1px); // adjust for border on hover
  }
  ${({ isPreviewing, hasNoContent }) =>
    (!isPreviewing || hasNoContent) &&
    "padding: calc(0.75rem - 1px);"}// adjust for border on preview/no entered content
`;

export const ClickToEditWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  height: 100%;
  width: 100%;
`;

export const TextInput = styled.textarea`
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  background-color: ${color("bg-light")};
  border: none;
  border-radius: 8px;
  box-shadow: none;
  font-size: 1.143em;
  height: inherit;
  line-height: 1.602em;
  min-height: unset;
  outline: none;
  padding: calc(0.5rem + 2px) 0.75rem; // align ReactMarkdown preview text with input text
  pointer-events: all;
  resize: none;
`;

export const DisplayContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0.75rem;
  width: 100%;

  ${({ isSingleRow }) =>
    isSingleRow &&
    `
    @media screen and (min-width: 1280px) {
        font-size: 0.85em;
    }
  `}
`;
