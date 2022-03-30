import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";

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

export const SearchIcon = styled(Icon)`
  margin-left: 10px;
`;

SearchIcon.defaultProps = {
  name: "search",
};

export const SearchResultsFloatingContainer = styled.div`
  position: absolute;
  top: 60px;
  left: 0;
  right: 0;
  color: ${color("text-dark")};
`;

export const SearchResultsContainer = styled(Card)`
  padding-top: 8px;
  padding-bottom: 8px;
  overflow-y: auto;
  max-height: 400px;
`;
