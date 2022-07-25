import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { breakpointMinHeightMedium } from "metabase/styled-components/theme";

export const TokenFieldItem = styled.li<{
  isValid: boolean;
}>`
  display: flex;
  align-items: center;
  margin: 0.25rem;
  padding: 0.5rem 0.3rem;
  ${breakpointMinHeightMedium} {
    padding: 0.75rem 0.5rem;
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
  padding: 0 0.5rem;
  color: ${({ isValid }) => (isValid ? "" : color("error"))};

  &:hover {
    color: ${color("error")};
  }
`;

export const TokenInputItem = styled.li`
  display: flex;
  flex: 1 0 auto;
  align-items: center;
  margin-right: 0.5rem;
  padding: 0.5rem;

  height: 38px;
  ${breakpointMinHeightMedium} {
    height: 54px;
  }
`;
