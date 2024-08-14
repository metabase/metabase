import styled from "@emotion/styled";

import SelectList from "metabase/components/SelectList";

export const EmptyStateContainer = styled.div`
  margin: 4rem 0;
`;

export const QuestionListItem = styled(SelectList.Item)`
  .Icon:last-child {
    justify-self: start;
  }
`;

export const PaginationControlsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
`;
