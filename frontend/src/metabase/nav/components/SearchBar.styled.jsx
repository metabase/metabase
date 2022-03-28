import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  background-color: ${color("bg-light")};
  border: 1px solid ${color("border")};
  border-radius: 6px;
  flex: 1 1 auto;
  max-width: 40em;
  align-items: center;
  transition: background 150ms;

  &:hover {
    background-color: ${color("bg-medium")};
  }
`;

export const SearchInput = styled.input`
  background-color: transparent;
  width: 100%;
  border: none;
  color: ${color("text-dark")};
  padding: 8px 12px;
  font-weight: 700;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-dark")};
  }
`;
