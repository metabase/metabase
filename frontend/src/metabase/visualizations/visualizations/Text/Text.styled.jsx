import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const EditModeContainer = styled.div`
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0.65em;
  width: 100%;

  ${({ isPreviewing }) => !isPreviewing && "padding: 0.5em 0.75em;"}
  ${({ isFocused }) =>
    isFocused &&
    `
    border: 1px solid ${color("brand")};
    border-radius: 8px;
    `}
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
  padding: 0.25em 0.75em;
  pointer-events: all;
  resize: none;
`;

export const DisplayContainer = styled.div`
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  padding: 0.65em;
  width: 100%;

  ${({ isSingleRow }) =>
    isSingleRow &&
    `
    @media screen and (min-width: 1280px) {
        font-size: 0.85em;
    }
  `}
`;
