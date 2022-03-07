import styled from "@emotion/styled";
import { space } from "styled-system";

import { color } from "metabase/lib/colors";

export const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  flex: 1 1 auto;
  max-width: 50em;
  align-items: center;
  transition: background 300ms ease-in;
`;

export const SearchInput = styled.input`
  ${space};
  background-color: transparent;
  width: 100%;
  border: none;
  color: ${color("text-dark")};
  font-size: 0.8em;
  font-weight: 700;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-medium")};
  }
`;
