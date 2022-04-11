import styled from "@emotion/styled";
import { SelectList } from "metabase/components/select-list";

export const EmptyStateContainer = styled.div`
  margin: 4rem 0;
`;

export const QuestionListItem = styled(SelectList.Item)`
  .Icon:last-child {
    justify-self: start;
  }
`;
