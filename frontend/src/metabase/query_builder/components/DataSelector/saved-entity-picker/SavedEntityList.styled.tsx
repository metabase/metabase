import styled from "@emotion/styled";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import SelectList from "metabase/components/SelectList";
import { breakpointMaxSmall } from "metabase/styled-components/theme/media-queries";

export const SavedEntityListRoot = styled(SelectList)`
  overflow: auto;
  width: 100%;
  padding: 0.5rem;

  ${breakpointMaxSmall} {
    min-height: 220px;
  }
`;

export const SavedEntityListItem = styled(SelectList.Item)`
  .Icon:last-child {
    justify-self: start;
  }
`;

export const SavedEntityListEmptyState = styled.div`
  margin: 7.5rem 0;
`;

export const LoadingWrapper = styled(LoadingAndErrorWrapper)`
  min-height: unset;
  height: 100%;
`;
