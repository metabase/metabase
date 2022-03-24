import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  background-color: ${color("bg-medium")};
  border-radius: 6px;
  flex: 1 1 auto;
  max-width: 50em;
  align-items: center;
  transition: background 300ms ease-in;
`;

export const SearchInput = styled.input`
  background-color: transparent;
  width: 100%;
  border: none;
  color: ${color("text-dark")};
  padding: ${space(2)};
  font-weight: 700;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-dark")};
  }
`;
