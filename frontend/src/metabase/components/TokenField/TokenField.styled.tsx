import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TokenFieldItem = styled.li<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  margin: 0 0.25rem 0.25rem 0;
  padding: 0.75rem 0.5rem;
  border-radius: 0.5rem;
  color: ${({ isValid }) => (isValid ? "" : color("error"))};
  background-color: ${color("bg-medium")};
`;

export const TokenFieldAddon = styled.a<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  color: ${({ isValid }) => (isValid ? "" : color("error"))};

  &:hover {
    color: ${color("error")};
  }
`;
