import styled from "@emotion/styled";
import { color, alpha, darken } from "metabase/lib/colors";
import { breakpointMinHeightMedium } from "metabase/styled-components/theme";

export const TokenFieldItem = styled.li<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  height: 30px;
  ${breakpointMinHeightMedium} {
    height: 46px;
  }
  border-radius: 0.5rem;
  color: ${({ isValid }) => (isValid ? color("brand") : color("error"))};
  background-color: ${alpha("brand", 0.2)};
`;

export const TokenFieldAddon = styled.a<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
  color: ${({ isValid }) => (isValid ? "" : color("error"))};

  &:hover {
    color: ${darken("brand", 0.2)};
  }
`;
