import styled from "styled-components";

import { SelectList } from "metabase/components/select-list";
import { breakpointMaxSmall } from "metabase/styled-components/theme/media-queries";

export const SavedQuestionListRoot = styled(SelectList)`
  overflow: auto;
  width: 100%;
  padding: 0.5rem;

  ${breakpointMaxSmall} {
    min-height: 220px;
  }
`;

export const SavedQuestionListItem = styled(SelectList.Item)`
  .Icon:last-child {
    justify-self: start;
  }
`;
