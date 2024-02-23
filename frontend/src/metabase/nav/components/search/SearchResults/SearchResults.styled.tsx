import styled from "@emotion/styled";

import { Stack } from "metabase/ui";

export const EmptyStateContainer = styled.div`
  margin-top: 4rem;
  margin-bottom: 2rem;
`;

export const SearchResultsList = styled(Stack)`
  overflow: hidden;
`;

export const ResultsContainer = styled.ul`
  overflow-y: auto;
  padding: 0.5rem;
`;

export const ResultsFooter = styled.li`
  list-style-type: none;
`;
