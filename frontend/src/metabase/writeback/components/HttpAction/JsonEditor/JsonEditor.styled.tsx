import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";

export const Editor = styled.textarea`
  width: 100%;
  height: 100%;
  color: ${color("text-medium")};

  border: none;
  overflow: auto;
  outline: none;

  box-shadow: none;

  resize: none;

  &::placeholder {
    color: ${color("text-light")};
  }
`;
