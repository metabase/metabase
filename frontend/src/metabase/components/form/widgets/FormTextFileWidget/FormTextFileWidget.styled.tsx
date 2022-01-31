import styled from "styled-components";
import { t } from "ttag";
import { color } from "metabase/lib/colors";

export interface FileInputProps {
  hasValue?: boolean;
}

export const FileInput = styled.input<FileInputProps>`
  font-family: inherit;

  &:active,
  &:focus {
    outline: none;
  }

  &::before {
    border: 1px solid ${color("border")};
    border-radius: 6px;
    box-sizing: border-box;
    color: ${color("text-dark")};
    content: "${t`Select a file`}";
    cursor: pointer;
    display: inline-block;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: bold;
    padding: 0.5rem 0.75rem;
    white-space: nowrap;
    user-select: none;
  }

  &:hover::before {
    border-color: ${color("brand")};
  }

  &:focus::before {
    outline: 2px solid ${color("focus")};
  }

  &:not(:focus-visible)::before {
    outline: none;
  }

  &::-webkit-file-upload-button {
    padding-top: 0.5rem;
    padding-right: 2rem;
    visibility: hidden;
  }
`;
