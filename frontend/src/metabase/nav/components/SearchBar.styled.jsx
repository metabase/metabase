import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SearchWrapper = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  max-width: 50em;

  position: relative;

  background-color: ${color("bg-light")};
  border: 1px solid ${color("border")};
  border-radius: 6px;

  transition: background 150ms;

  &:hover {
    background-color: ${color("bg-medium")};
  }
`;

export const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px;
  font-weight: 700;

  color: ${color("text-dark")};
  background-color: transparent;
  border: none;

  &:focus {
    outline: none;
  }
  &::placeholder {
    color: ${color("text-dark")};
  }
`;
