import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const FileInput = styled.input`
  &::file-selector-button {
    padding: 0.75rem 1rem;
    margin-right: 1rem;
    border-radius: 4px;
    border: 1px solid ${color("border")};
    background-color: ${color("white")};
    color: ${color("text-dark")};
    transition: 200ms;
    cursor: pointer;
    font-family: var(--mb-default-font-family);
  }

  &::file-selector-button:hover {
    color: ${color("brand")};
    background-color: ${color("bg-light")};
  }
`;

FileInput.defaultProps = {
  type: "file",
};
