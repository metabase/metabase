import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const InputRoot = styled.label`
  display: flex;
`;

export const InputField = styled.input`
  flex: 1 1 auto;
  font-family: inherit;
  order: 1;

  &:active,
  &:focus {
    outline: none;
  }

  &::-webkit-file-upload-button {
    padding-top: 0.5rem;
    padding-right: 2rem;
    visibility: hidden;
  }
`;

export const InputButton = styled.span`
  border: 1px solid ${color("border")};
  border-radius: 6px;
  box-sizing: border-box;
  color: ${color("text-dark")};
  cursor: pointer;
  display: inline-block;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: bold;
  padding: 0.5rem 0.75rem;
  white-space: nowrap;
  user-select: none;

  ${InputField}:focus + & {
    outline: 2px solid ${color("focus")};
  }

  ${InputField}:not(:focus-visible) + & {
    outline: none;
  }
`;
