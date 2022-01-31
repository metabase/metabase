import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const LinkRoot = styled.a`
  &:focus {
    outline: 2px solid ${color("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
