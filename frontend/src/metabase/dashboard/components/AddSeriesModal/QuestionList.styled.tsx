import styled from "@emotion/styled";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Input from "metabase/core/components/Input";
import { color } from "metabase/lib/colors";

export const QuestionListWrapper = styled(LoadingAndErrorWrapper)`
  flex: 1;
  margin: 0;
  padding: 0;
  width: 100%;
`;

export const QuestionListContainer = styled.ul`
  margin: 0;
  padding: 0;
  width: 100%;
`;

export const LoadMoreButton = styled.button`
  align-items: center;
  color: ${color("brand")};
  cursor: pointer;
  display: flex;
  font-family: var(--mb-default-font-family);
  font-size: 14px;
  font-weight: 700;
  padding: 0.25rem 1.5rem;
`;

export const LoadMoreRow = styled.li`
  align-items: center;
  display: flex;
  justify-content: center;
  list-style: none;
  margin: 0;
  padding: 0.5rem 0;
  width: 100%;
`;

export const SearchContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  flex: 0;
  border-bottom: 1px solid ${color("border")};
`;

export const SearchInput = styled(Input)`
  width: 100%;

  ${Input.Field} {
    border-radius: 0;
    outline: none;
  }
`;

export const EmptyStateContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;
