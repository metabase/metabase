import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TextArea = styled.textarea`
  min-width: 100%;
  max-width: 100%;
  min-height: 9rem;
  padding: 8px;

  border: 1px solid ${color("border")};
  border-radius: 6px;

  transition: border 0.3s;
  outline: none;

  &:hover,
  &:focus {
    border-color: ${color("brand")};
  }
`;
