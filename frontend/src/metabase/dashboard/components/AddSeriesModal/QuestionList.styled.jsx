import styled from "styled-components";

import { color } from "metabase/lib/colors";
import TextInput from "metabase/components/TextInput";

export const QuestionListContainer = styled.div`
  padding-right: 0.5rem;
  padding-bottom: 1rem;
  width: 100%;
`;

export const LoadMoreButton = styled.button`
  font-family: var(--default-font-family);
  display: flex;
  align-items: center;
  cursor: pointer;
  color: ${color("brand")};
  padding: 0.25rem 1.5rem;
  font-size: 14px;
  font-weight: 700;
`;

export const LoadMoreRow = styled.li`
  display: flex;
  align-items: center;
  justify-content: center;
  list-style: none;
`;

export const SearchContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  border-bottom: 1px solid ${color("border")};
`;

export const SearchInput = styled(TextInput)`
  width: 100%;
`;

export const EmptyStateContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;
