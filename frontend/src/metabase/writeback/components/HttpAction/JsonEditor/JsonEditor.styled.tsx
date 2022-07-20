import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";

export const Editor = styled.textarea`
  color: ${color("text-medium")};

  border: none;
  overflow: auto;
  outline: none;

  box-shadow: none;

  resize: none;
`;
