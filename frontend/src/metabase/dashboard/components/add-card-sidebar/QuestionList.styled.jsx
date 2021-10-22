import styled from "styled-components";

import { SelectList } from "metabase/components/select-list";

export const EmptyStateContainer = styled.div`
  margin: 4rem 0;
`;

export const QuestionListItem = styled(SelectList.Item)`
  .Icon:last-child {
    justify-self: start;
  }
`;
