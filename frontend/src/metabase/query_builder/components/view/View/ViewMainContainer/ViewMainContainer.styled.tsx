import { css } from "@emotion/react";
import styled from "@emotion/styled";

import DebouncedFrame from "metabase/components/DebouncedFrame";
import { SyncedParametersList } from "metabase/query_builder/components/SyncedParametersList";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const QueryBuilderMain = styled.main<{
  isSidebarOpen: boolean;
}>`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  flex-basis: 0;

  ${breakpointMaxSmall} {
    ${props =>
      props.isSidebarOpen &&
      css`
        display: none !important;
      `};
    position: relative;
  }
`;
export const StyledDebouncedFrame = styled(DebouncedFrame)`
  flex: 1 0 auto;
  flex-grow: 1;
`;
export const StyledSyncedParametersList = styled(SyncedParametersList)`
  margin-top: 1rem;
  margin-left: 1.5rem;
`;
